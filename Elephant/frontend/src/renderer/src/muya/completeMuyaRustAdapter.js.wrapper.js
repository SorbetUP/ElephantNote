import CompleteMuyaWithRustCore from './completeMuyaRustAdapter.js'
import { createRustAsyncMutationGate } from './rustAsyncMutationGate.js'
import { selectionToMuyaIndexCursor } from './realMuyaRustMirrorRuntime.js'

const cloneState = (state) => state && ({
  ...state,
  selection: { ...state.selection }
})

export default class StableCompleteMuyaWithRustCore extends CompleteMuyaWithRustCore {
  constructor (element, options = {}) {
    super(element, options)

    // Muya's keyboard layer calls dispatchChange immediately after invoking a
    // ContentState handler. Rust handlers are asynchronous, so that immediate
    // dispatch observes the old DOM and used to save/reconcile stale Markdown.
    this.__rustMutationGate = createRustAsyncMutationGate({
      dispatch: this.dispatchChange,
      onSuppressed: () => this.__programmaticGuard().consume()
    })
    this.dispatchChange = this.__rustMutationGate.dispatch

    // Muya has several context-specific Enter paths. Some inline contexts consume
    // the key without reaching enterHandler or docEnterHandler. Capture the real
    // keyboard event once at the editor boundary and send every normal Enter to
    // the Rust-owned command path, so inline code and document boundaries cannot
    // silently discard the user's line break.
    this.__rustEnterKeydownListener = (event) => {
      if (event?.key !== 'Enter' || event?.isComposing) return
      this.__onUserMutation?.(`keydown:${event.shiftKey ? 'Shift+Enter' : 'Enter'}`)
      const pending = this.__enter(event)
      pending?.catch?.(() => {})
    }
    this.container.addEventListener('keydown', this.__rustEnterKeydownListener, true)

    // Muya may normalize loaded Markdown while parsing it. The Rust session must
    // start from the document that Muya actually rendered, not from the raw file
    // and not from repeated parse/export passes.
    const markdown = this.getMarkdown()
    const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
    // The mirror's first reset initializes the Tauri session. Queue the
    // canonical Muya normalization only after that reset has completed;
    // issuing both resets synchronously can make the second command observe a
    // session that has not been initialized yet.
    this.__rustCanonicalReady = this.__rustMirror?.ready
      ?.then(() => this.__rustMirror.reset(markdown, 'constructor-canonical', { muyaIndexCursor }))
      .then(() => this.__refreshClipboard())
      .catch(this.__reportRustError)
  }

  getMarkdown () {
    const exported = super.getMarkdown()
    const canonical = this.__rustMirror?.state?.markdown

    // Muya intentionally omits the final empty paragraph from its serialized
    // Markdown. The Rust editor, however, must retain that trailing newline
    // between Enter and the user's next keystroke. Treat both representations
    // as the same visible document while keeping Rust's caret-bearing state.
    if (
      typeof canonical === 'string' &&
      canonical.endsWith('\n') &&
      exported === canonical.replace(/\n+$/, '')
    ) {
      return canonical
    }

    return exported
  }

  __selection () {
    const current = super.__selection()
    const canonical = this.__rustMirror?.state?.markdown
    if (typeof canonical !== 'string' || !canonical.endsWith('\n')) return current

    const exported = super.getMarkdown()
    const collapsedAtVisibleEnd = current.selection.anchor === exported.length &&
      current.selection.focus === exported.length
    if (!collapsedAtVisibleEnd || exported !== canonical.replace(/\n+$/, '')) return current

    // A trailing empty Muya paragraph has no serialized text node. When the DOM
    // caret is at the visible end, map it to Rust's logical position after the
    // retained newline instead of moving it back before that newline. Otherwise
    // the next queued keystroke joins both lines again.
    const selection = { anchor: canonical.length, focus: canonical.length }
    return {
      ...current,
      markdown: canonical,
      selection,
      cursor: selectionToMuyaIndexCursor(canonical, selection)
    }
  }

  __docEnter (event) {
    // Muya routes Enter at the document boundary through docEnterHandler. The
    // legacy image-only handler prevented the browser event and then returned
    // without mutating the document when no image was selected. Delegate normal
    // document-boundary Enter to the Rust-owned smart Enter path instead.
    if (!this.contentState?.selectedImage) return super.__enter(event)
    return super.__docEnter(event)
  }

  __renderCanonicalMarkdown (
    markdown,
    cursor,
    isRenderCursor = true,
    muyaIndexCursor,
    blocks
  ) {
    const result = this.__setProgrammaticMarkdown(
      markdown,
      cursor,
      isRenderCursor,
      muyaIndexCursor,
      blocks
    )

    // Reading once after the synchronous Muya render is sufficient. Re-rendering
    // the exported Markdown with an index cursor re-injects Muya cursor DNA and
    // can grow the document on every pass.
    return {
      result,
      markdown: this.getMarkdown(),
      muyaIndexCursor: this.contentState.getMuyaIndexCursor()
    }
  }

  setMarkdown (
    markdown,
    cursor,
    isRenderCursor = true,
    muyaIndexCursor = undefined,
    blocks = undefined
  ) {
    const rendered = this.__renderCanonicalMarkdown(
      markdown,
      cursor,
      isRenderCursor,
      muyaIndexCursor,
      blocks
    )
    this.__rustComposition = null

    this.__rustMirror?.reset(rendered.markdown, 'set-markdown-canonical', {
      muyaIndexCursor: rendered.muyaIndexCursor
    })
      .then(() => this.__refreshClipboard())
      .catch(this.__reportRustError)

    return rendered.result
  }

  async __adoptRenderedCanonicalMarkdown (state, rendered, reason, continueGroup) {
    if (!state || rendered.markdown === state.markdown) return state

    const mirror = this.__requireRust()
    if (Number(state.revision) === 0 && Number(state.undoDepth) === 0) {
      await mirror.reset(rendered.markdown, reason, {
        muyaIndexCursor: rendered.muyaIndexCursor
      })
    } else {
      await mirror.sync(rendered.markdown, reason, {
        muyaIndexCursor: rendered.muyaIndexCursor,
        continueGroup: Boolean(continueGroup)
      })
    }
    await mirror.flush()
    return mirror.state
  }

  async __repairVisibleDocumentFromRust (name) {
    const mirror = this.__requireRust()
    await mirror.flush()
    const state = mirror.state
    if (!state) return

    const received = this.getMarkdown()
    if (received === state.markdown) return

    const rendered = this.__renderCanonicalMarkdown(
      state.markdown,
      undefined,
      true,
      selectionToMuyaIndexCursor(state.markdown, state.selection)
    )
    super.clearHistory()
    const repairedState = await this.__adoptRenderedCanonicalMarkdown(
      state,
      rendered,
      `pre-${name}-render-canonicalization`,
      Number(state.undoDepth) > 0
    )

    console.warn('[elephantnote:muya-rust] repaired visible Muya state before a Rust command', {
      command: name,
      rustLength: state.markdown.length,
      receivedLength: received.length,
      repairedLength: repairedState?.markdown?.length ?? rendered.markdown.length,
      revision: repairedState?.revision ?? state.revision
    })
  }

  __applyRust (name, operation) {
    const execute = async() => {
      await this.__repairVisibleDocumentFromRust(name)
      return super.__applyRust(name, operation)
    }
    return this.__rustMutationGate.enqueue(execute)
  }

  async __renderRust (transaction) {
    if (!transaction?.state) return transaction
    if (!transaction.documentChanged && !transaction.selectionChanged) return transaction

    const { state } = transaction
    const rendered = this.__renderCanonicalMarkdown(
      state.markdown,
      undefined,
      true,
      selectionToMuyaIndexCursor(state.markdown, state.selection)
    )
    super.clearHistory()

    const canonicalState = await this.__adoptRenderedCanonicalMarkdown(
      state,
      rendered,
      'post-command-render-canonicalization',
      transaction.documentChanged
    )

    if (canonicalState === state) return transaction
    return {
      ...transaction,
      state: cloneState(canonicalState),
      documentChanged: true,
      selectionChanged: true
    }
  }
}

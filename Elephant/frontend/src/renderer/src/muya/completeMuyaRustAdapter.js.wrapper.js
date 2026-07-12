import CompleteMuyaWithRustCore from './completeMuyaRustAdapter.js'
import { selectionToMuyaIndexCursor } from './realMuyaRustMirrorRuntime.js'
import { stabilizeProgrammaticMarkdown } from './rustMarkdownStabilizer.js'

const cloneState = (state) => state && ({
  ...state,
  selection: { ...state.selection }
})

export default class StableCompleteMuyaWithRustCore extends CompleteMuyaWithRustCore {
  constructor (element, options = {}) {
    super(element, options)
    this.__rustOperationQueue = Promise.resolve()

    const markdown = this.getMarkdown()
    const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
    this.__rustMirror?.reset(markdown, 'constructor-canonical', { muyaIndexCursor })
      .then(() => this.__refreshClipboard())
      .catch(this.__reportRustError)
  }

  __renderCanonicalMarkdown (
    markdown,
    cursor,
    isRenderCursor = true,
    muyaIndexCursor,
    blocks
  ) {
    const rendered = stabilizeProgrammaticMarkdown({
      markdown,
      cursor,
      isRenderCursor,
      muyaIndexCursor,
      blocks,
      render: (...args) => this.__setProgrammaticMarkdown(...args),
      readMarkdown: () => this.getMarkdown(),
      readMuyaIndexCursor: () => this.contentState.getMuyaIndexCursor()
    })

    if (!rendered.stable) {
      console.warn('[elephantnote:muya-rust] Muya Markdown round trip did not reach a fixed point', {
        cycle: rendered.cycle,
        passes: rendered.passes,
        markdownLength: rendered.markdown.length
      })
    }
    return rendered
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
    const queued = (this.__rustOperationQueue || Promise.resolve())
      .catch(() => undefined)
      .then(execute)
    this.__rustOperationQueue = queued
    return queued
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

import { createMuyaFullEditorRuntime } from './fullEditorRuntime.js'
import { readMarkdownSelection, restoreMarkdownSelection } from './markdownSelectionRuntime.js'
import { createRustMuyaEngineClient } from './rustEngineRuntime.js'

const utf16Length = (value = '') => String(value).length

export const createRustBackedMuyaFullEditorRuntime = (root, markdown = '', options = {}) => {
  const view = createMuyaFullEditorRuntime(root, markdown, options)
  const engine = createRustMuyaEngineClient(options)
  let ready = false
  let destroyed = false
  let compositionSelection = null
  let historyGroup = null
  let queue = Promise.resolve()

  const initialized = engine.create(markdown).then(async() => {
    view.setJsonState(await engine.jsonState(), 'rust:init')
    ready = true
    return engine.state
  })

  const enqueue = (operation) => {
    const run = queue.then(async() => {
      if (destroyed) throw new Error('Muya Rust runtime has been destroyed.')
      await initialized
      return operation()
    })
    queue = run.catch(() => {})
    return run
  }

  const closeHistoryGroup = () => {
    historyGroup = null
  }

  const readDomSelection = () => readMarkdownSelection(
    root,
    options.document?.defaultView?.getSelection?.() || globalThis.getSelection?.()
  )

  const synchronizeSelectionToRust = async() => {
    const selection = readDomSelection()
    if (!selection) return engine.state?.selection || null
    const current = engine.state?.selection
    if (current?.anchor === selection.anchor && current?.focus === selection.focus) return current
    await engine.setSelection(selection.anchor, selection.focus)
    return engine.state.selection
  }

  const restoreCanonicalSelection = () => {
    if (!engine.state?.selection) return false
    return restoreMarkdownSelection(root, engine.state.selection, options.document || root?.ownerDocument)
  }

  const renderCanonicalState = async(group = 'rust') => {
    view.setJsonState(await engine.jsonState(), group)
    restoreCanonicalSelection()
    return engine.markdown
  }

  const apply = (operation, group = 'rust', { synchronizeSelection = true } = {}) => enqueue(async() => {
    if (compositionSelection) {
      throw new Error('Muya cannot apply a command while an IME composition is active.')
    }
    closeHistoryGroup()
    if (synchronizeSelection) await synchronizeSelectionToRust()
    const transaction = await operation()
    if (transaction?.documentChanged) {
      await renderCanonicalState(group)
    } else {
      restoreCanonicalSelection()
    }
    return transaction
  })

  const query = (operation, { synchronizeSelection = true } = {}) => enqueue(async() => {
    if (synchronizeSelection && !compositionSelection) await synchronizeSelectionToRust()
    return operation()
  })

  const setMarkdown = (next, group = 'external') => enqueue(async() => {
    compositionSelection = null
    closeHistoryGroup()
    await engine.reset(String(next || ''))
    await renderCanonicalState(group)
    return engine.state
  })

  const startComposition = () => enqueue(async() => {
    if (compositionSelection) return compositionSelection
    closeHistoryGroup()
    const selection = await synchronizeSelectionToRust()
    compositionSelection = selection
      ? { anchor: selection.anchor, focus: selection.focus }
      : { anchor: engine.state.selection.anchor, focus: engine.state.selection.focus }
    return compositionSelection
  })

  const commitComposition = (text = '') => enqueue(async() => {
    const selection = compositionSelection || engine.state?.selection
    if (!selection) throw new Error('Muya IME composition has no valid selection.')
    closeHistoryGroup()
    const transaction = await engine.commitComposition(selection, text)
    compositionSelection = null
    if (transaction?.documentChanged) {
      await renderCanonicalState('composition')
    } else {
      restoreCanonicalSelection()
    }
    return transaction
  })

  const cancelComposition = () => enqueue(async() => {
    compositionSelection = null
    closeHistoryGroup()
    await renderCanonicalState('composition:cancel')
    return engine.markdown
  })

  const syncDomToRust = (group = 'input') => enqueue(async() => {
    if (compositionSelection) return engine.markdown
    const selection = readDomSelection()
    view.renderLiveNow?.(group)
    const next = view.domToMarkdown()
    let documentChanged = false
    if (next !== engine.markdown) {
      const continueGroup = historyGroup === group
      await engine.setSelection(0, utf16Length(engine.markdown))
      const transaction = await engine.applyGrouped(
        { type: 'replaceSelection', text: next },
        continueGroup
      )
      documentChanged = Boolean(transaction?.documentChanged)
      if (documentChanged) historyGroup = group
    }
    if (selection) await engine.setSelection(selection.anchor, selection.focus)
    if (documentChanged) {
      await renderCanonicalState(group)
    } else {
      restoreCanonicalSelection()
    }
    return engine.markdown
  })

  const destroy = () => {
    destroyed = true
    compositionSelection = null
    closeHistoryGroup()
    view.live?.cancel?.()
  }

  return {
    root,
    view,
    engine,
    live: view.live,
    history: null,
    get ready() { return ready },
    get readyPromise() { return initialized },
    get state() { return engine.state },
    get documentState() { return view.state },
    get markdown() { return ready ? engine.markdown : view.markdown },
    get html() { return view.html },
    get composing() { return Boolean(compositionSelection) },
    get currentHistoryGroup() { return historyGroup },
    setMarkdown,
    syncDomToRust,
    startComposition,
    commitComposition,
    cancelComposition,
    closeHistoryGroup,
    synchronizeSelectionToRust: () => enqueue(synchronizeSelectionToRust),
    restoreCanonicalSelection,
    destroy,
    scheduleLiveRender: () => view.scheduleLiveRender(),
    renderLiveNow: (group = 'live') => syncDomToRust(group),
    renderCurrentBlockNow: () => view.renderCurrentBlockNow(),
    domToMarkdown: () => view.domToMarkdown(),
    snapshotSelection: () => view.snapshotSelection(),
    restoreSelection: (snapshot) => view.restoreSelection(snapshot),
    copy: () => query(() => engine.clipboard()),
    imageToolbar: (cursor = null) => query(() => engine.imageToolbar(cursor)),
    footnotePopup: (cursor = null) => query(() => engine.footnotePopup(cursor)),
    slashCommands: (queryText = '') => query(
      () => engine.slashCommands(queryText),
      { synchronizeSelection: false }
    ),
    previewDescriptor: (blockType, language = null, text = '') => query(
      () => engine.previewDescriptor(blockType, language, text),
      { synchronizeSelection: false }
    ),
    floatingToolbar: view.floatingToolbar,
    renderPreviewBlock: view.renderPreviewBlock,
    applyOperation: (operation) => apply(
      () => engine.applyOperation(operation),
      'operation',
      { synchronizeSelection: false }
    ),
    insertText: (text) => apply(() => engine.insertText(text), 'insert'),
    replaceSelection: (text) => apply(() => engine.replaceSelection(text), 'replace'),
    deleteBackward: () => apply(() => engine.deleteBackward(), 'delete'),
    deleteForward: () => apply(() => engine.deleteForward(), 'delete'),
    setSelection: (anchor, focus = anchor) => apply(
      () => engine.setSelection(anchor, focus),
      'selection',
      { synchronizeSelection: false }
    ),
    toggleInline: (marker) => apply(() => engine.toggleInline(marker), 'format'),
    transformBlock: (kind) => apply(() => engine.transformBlock(kind), 'block'),
    insertLineBreak: () => apply(() => engine.insertLineBreak(), 'insert'),
    keyboardRule: (key, keyOptions) => apply(() => engine.keyboardRule(key, keyOptions), `key:${key}`),
    undo: () => apply(() => engine.undo(), 'undo', { synchronizeSelection: false }),
    redo: () => apply(() => engine.redo(), 'redo', { synchronizeSelection: false }),
    table: (action, index = 0) => apply(() => engine.tableCommand(action, index), `table:${action}`),
    resizeImage: (cursor, width) => apply(() => engine.resizeImage(cursor, width), 'image:resize'),
    upsertFootnote: (label, text) => apply(() => engine.upsertFootnote(label, text), 'footnote'),
    insertTemplate: (id) => apply(() => engine.insertTemplate(id), `template:${id}`)
  }
}

import { createMuyaFullEditorRuntime } from './fullEditorRuntime.js'
import { readMarkdownSelection, restoreMarkdownSelection } from './markdownSelectionRuntime.js'
import { createRustMuyaEngineClient } from './rustEngineRuntime.js'

const utf16Length = (value = '') => String(value).length

export const createRustBackedMuyaFullEditorRuntime = (root, markdown = '', options = {}) => {
  const view = createMuyaFullEditorRuntime(root, markdown, options)
  const engine = createRustMuyaEngineClient(options)
  let ready = false
  let destroyed = false
  let queue = Promise.resolve()

  const enqueue = (operation) => {
    const run = queue.then(async() => {
      if (destroyed) throw new Error('Muya Rust runtime has been destroyed.')
      await initialized
      return operation()
    })
    queue = run.catch(() => {})
    return run
  }

  const initialized = engine.create(markdown).then(() => {
    ready = true
    return engine.state
  })

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

  const renderCanonicalState = (group = 'rust') => {
    if (view.markdown !== engine.markdown) view.setMarkdown(engine.markdown, group)
    restoreCanonicalSelection()
    return engine.markdown
  }

  const apply = (operation, group = 'rust', { synchronizeSelection = true } = {}) => enqueue(async() => {
    if (synchronizeSelection) await synchronizeSelectionToRust()
    const transaction = await operation()
    renderCanonicalState(group)
    return transaction
  })

  const query = (operation, { synchronizeSelection = true } = {}) => enqueue(async() => {
    if (synchronizeSelection) await synchronizeSelectionToRust()
    return operation()
  })

  const setMarkdown = (next, group = 'external') => enqueue(async() => {
    const value = String(next || '')
    await engine.reset(value)
    view.setMarkdown(value, group)
    restoreCanonicalSelection()
    return engine.state
  })

  const syncDomToRust = (group = 'input') => enqueue(async() => {
    const selection = readDomSelection()
    view.renderLiveNow?.(group)
    const next = view.domToMarkdown()
    if (next !== engine.markdown) {
      await engine.applyOperation({
        type: 'replace',
        pos: 0,
        count: utf16Length(engine.markdown),
        text: next
      })
    }
    if (selection) await engine.setSelection(selection.anchor, selection.focus)
    restoreCanonicalSelection()
    return engine.markdown
  })

  const destroy = () => {
    destroyed = true
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
    get markdown() { return ready ? engine.markdown : view.markdown },
    get html() { return view.html },
    setMarkdown,
    syncDomToRust,
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
    keyboardRule: (key, options) => apply(() => engine.keyboardRule(key, options), `key:${key}`),
    undo: () => apply(() => engine.undo(), 'undo', { synchronizeSelection: false }),
    redo: () => apply(() => engine.redo(), 'redo', { synchronizeSelection: false }),
    table: (action, index = 0) => apply(() => engine.tableCommand(action, index), `table:${action}`),
    resizeImage: (cursor, width) => apply(() => engine.resizeImage(cursor, width), 'image:resize'),
    upsertFootnote: (label, text) => apply(() => engine.upsertFootnote(label, text), 'footnote'),
    insertTemplate: (id) => apply(() => engine.insertTemplate(id), `template:${id}`)
  }
}

import { createMuyaFullEditorRuntime } from './fullEditorRuntime.js'
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

  const renderCanonicalState = (group = 'rust') => {
    if (view.markdown !== engine.markdown) view.setMarkdown(engine.markdown, group)
    return engine.markdown
  }

  const apply = (operation, group = 'rust') => enqueue(async() => {
    const transaction = await operation()
    renderCanonicalState(group)
    return transaction
  })

  const setMarkdown = (next, group = 'external') => enqueue(async() => {
    const value = String(next || '')
    await engine.reset(value)
    view.setMarkdown(value, group)
    return engine.state
  })

  const syncDomToRust = (group = 'input') => enqueue(async() => {
    view.renderLiveNow?.(group)
    const next = view.domToMarkdown()
    if (next === engine.markdown) return engine.markdown
    await engine.applyOperation({
      type: 'replace',
      pos: 0,
      count: utf16Length(engine.markdown),
      text: next
    })
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
    destroy,
    scheduleLiveRender: () => view.scheduleLiveRender(),
    renderLiveNow: (group = 'live') => syncDomToRust(group),
    renderCurrentBlockNow: () => view.renderCurrentBlockNow(),
    domToMarkdown: () => view.domToMarkdown(),
    snapshotSelection: () => view.snapshotSelection(),
    restoreSelection: (snapshot) => view.restoreSelection(snapshot),
    copy: () => view.copy(),
    imageToolbar: (cursor) => view.imageToolbar(cursor),
    footnotePopup: (cursor) => view.footnotePopup(cursor),
    floatingToolbar: view.floatingToolbar,
    previewBlock: view.previewBlock,
    renderPreviewBlock: view.renderPreviewBlock,
    applyOperation: (operation) => apply(() => engine.applyOperation(operation), 'operation'),
    insertText: (text) => apply(() => engine.insertText(text), 'insert'),
    replaceSelection: (text) => apply(() => engine.replaceSelection(text), 'replace'),
    deleteBackward: () => apply(() => engine.deleteBackward(), 'delete'),
    deleteForward: () => apply(() => engine.deleteForward(), 'delete'),
    setSelection: (anchor, focus = anchor) => enqueue(() => engine.setSelection(anchor, focus)),
    toggleInline: (marker) => apply(() => engine.toggleInline(marker), 'format'),
    transformBlock: (kind) => apply(() => engine.transformBlock(kind), 'block'),
    insertLineBreak: () => apply(() => engine.insertLineBreak(), 'insert'),
    keyboardRule: (key, options) => apply(() => engine.keyboardRule(key, options), `key:${key}`),
    undo: () => apply(() => engine.undo(), 'undo'),
    redo: () => apply(() => engine.redo(), 'redo'),
    table: (action, index = 0) => apply(() => engine.tableCommand(action, index), `table:${action}`),
    resizeImage: (cursor, width) => apply(() => engine.resizeImage(cursor, width), 'image:resize'),
    upsertFootnote: (label, text) => apply(() => engine.upsertFootnote(label, text), 'footnote'),
    insertTemplate: (id) => apply(() => engine.insertTemplate(id), `template:${id}`)
  }
}

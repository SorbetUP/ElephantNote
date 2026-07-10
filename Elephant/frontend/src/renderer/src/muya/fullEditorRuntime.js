import { createDomEditor } from './selectionRuntime.js'
import { markdownToJsonState, jsonStateToMarkdown, jsonStateToHtml, renderJsonStateIntoDom } from './jsonStateRuntime.js'
import { applyOperation, createGroupedHistory, pushGroupedHistory, undoGroupedHistory, redoGroupedHistory } from './operationsRuntime.js'
import { clipboardPayloadToMarkdown, copyMarkdownAndHtml } from './clipboardRuntime.js'
import { imageToolbarState, resizeImageMarkdown, tableCommand } from './tableImageRuntime.js'
import { floatingToolbarState, footnotePopupState, previewBlock, slashCommands, upsertFootnote } from './menusPreviewRuntime.js'
import { createLiveRenderScheduler, domToMarkdown } from './liveRenderingRuntime.js'
import { renderCurrentBlockNow } from './blockLiveRuntime.js'
import { renderPreviewBlock } from './previewRenderersRuntime.js'

const validateJsonState = (nextState) => {
  if (!nextState || nextState.type !== 'muya-json-state' || !Array.isArray(nextState.blocks)) {
    throw new Error('Muya DOM adapter requires a valid JSON document state.')
  }
  return nextState
}

export const createMuyaFullEditorRuntime = (root, markdown = '', options = {}) => {
  const editor = createDomEditor(root, options.document || globalThis.document)
  const history = createGroupedHistory()
  let state = markdownToJsonState(markdown)
  renderJsonStateIntoDom(root, state, options.document || globalThis.document)

  const adoptJsonState = (nextState) => {
    state = validateJsonState(nextState)
    return state
  }

  const setJsonState = (nextState, group = 'setJsonState') => {
    validateJsonState(nextState)
    const before = jsonStateToMarkdown(state)
    const after = jsonStateToMarkdown(nextState)
    state = nextState
    pushGroupedHistory(history, before, after, group)
    renderJsonStateIntoDom(root, state, options.document || globalThis.document)
    return state
  }

  const setMarkdown = (next, group = 'setMarkdown') => setJsonState(markdownToJsonState(next), group)

  const live = createLiveRenderScheduler({
    root,
    getState: () => state,
    setState: (nextState) => { state = nextState },
    getDocument: () => options.document || globalThis.document,
    delay: options.liveDelay || 0
  })

  const syncDomToState = (group = 'live') => {
    const before = jsonStateToMarkdown(state)
    const blockResult = renderCurrentBlockNow({
      root,
      setState: (nextState) => { state = nextState },
      getDocument: () => options.document || globalThis.document
    })
    const result = blockResult || live.renderNow()
    const after = jsonStateToMarkdown(state)
    if (result && after !== before) pushGroupedHistory(history, before, after, group)
    return state
  }

  return {
    root,
    editor,
    history,
    live,
    get state() { return state },
    get markdown() { return jsonStateToMarkdown(state) },
    get html() { return jsonStateToHtml(state) },
    setMarkdown,
    setJsonState,
    adoptJsonState,
    scheduleLiveRender: () => live.schedule(),
    renderLiveNow: syncDomToState,
    renderCurrentBlockNow: () => renderCurrentBlockNow({ root, setState: (nextState) => { state = nextState }, getDocument: () => options.document || globalThis.document }),
    domToMarkdown: () => domToMarkdown(root),
    snapshotSelection: () => editor?.snapshotSelection?.(),
    restoreSelection: (snapshot) => editor?.restoreSelection?.(snapshot),
    applyOperation: (operation, group = 'operation') => setMarkdown(applyOperation(jsonStateToMarkdown(state), operation), group),
    undo: () => {
      const result = undoGroupedHistory(history, jsonStateToMarkdown(state))
      state = markdownToJsonState(result.markdown)
      renderJsonStateIntoDom(root, state, options.document || globalThis.document)
      return state
    },
    redo: () => {
      const result = redoGroupedHistory(history, jsonStateToMarkdown(state))
      state = markdownToJsonState(result.markdown)
      renderJsonStateIntoDom(root, state, options.document || globalThis.document)
      return state
    },
    pasteClipboard: (payload) => setMarkdown(`${jsonStateToMarkdown(state)}\n\n${clipboardPayloadToMarkdown(payload)}`.trim(), 'paste'),
    copy: () => copyMarkdownAndHtml(jsonStateToMarkdown(state), () => jsonStateToHtml(state)),
    table: (command, index = 0) => setMarkdown(tableCommand(jsonStateToMarkdown(state), command, index), `table:${command}`),
    imageToolbar: (cursor) => imageToolbarState(jsonStateToMarkdown(state), cursor),
    resizeImage: (cursor, width) => setMarkdown(resizeImageMarkdown(jsonStateToMarkdown(state), cursor, width), 'image:resize'),
    footnotePopup: (cursor) => footnotePopupState(jsonStateToMarkdown(state), cursor),
    upsertFootnote: (label, text) => setMarkdown(upsertFootnote(jsonStateToMarkdown(state), label, text), 'footnote'),
    slashCommands,
    floatingToolbar: floatingToolbarState,
    previewBlock,
    renderPreviewBlock
  }
}

export * from './selectionRuntime.js'
export * from './jsonStateRuntime.js'
export * from './operationsRuntime.js'
export * from './clipboardRuntime.js'
export * from './tableImageRuntime.js'
export * from './menusPreviewRuntime.js'
export * from './liveRenderingRuntime.js'
export * from './blockLiveRuntime.js'
export * from './inputRulesRuntime.js'
export * from './previewRenderersRuntime.js'

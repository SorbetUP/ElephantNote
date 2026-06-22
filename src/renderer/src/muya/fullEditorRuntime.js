import { createDomEditor } from './selectionRuntime.js'
import { markdownToJsonState, jsonStateToMarkdown, jsonStateToHtml, renderJsonStateIntoDom } from './jsonStateRuntime.js'
import { applyOperation, createGroupedHistory, pushGroupedHistory, undoGroupedHistory, redoGroupedHistory } from './operationsRuntime.js'
import { clipboardPayloadToMarkdown, copyMarkdownAndHtml } from './clipboardRuntime.js'
import { imageToolbarState, resizeImageMarkdown, tableCommand } from './tableImageRuntime.js'
import { floatingToolbarState, footnotePopupState, previewBlock, slashCommands, upsertFootnote } from './menusPreviewRuntime.js'

export const createMuyaFullEditorRuntime = (root, markdown = '', options = {}) => {
  const editor = createDomEditor(root, options.document || globalThis.document)
  const history = createGroupedHistory()
  let state = markdownToJsonState(markdown)
  renderJsonStateIntoDom(root, state, options.document || globalThis.document)

  const setMarkdown = (next, group = 'setMarkdown') => {
    const before = jsonStateToMarkdown(state)
    state = markdownToJsonState(next)
    pushGroupedHistory(history, before, next, group)
    renderJsonStateIntoDom(root, state, options.document || globalThis.document)
    return state
  }

  return {
    root,
    editor,
    history,
    get state() { return state },
    get markdown() { return jsonStateToMarkdown(state) },
    get html() { return jsonStateToHtml(state) },
    setMarkdown,
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
    previewBlock
  }
}

export * from './selectionRuntime.js'
export * from './jsonStateRuntime.js'
export * from './operationsRuntime.js'
export * from './clipboardRuntime.js'
export * from './tableImageRuntime.js'
export * from './menusPreviewRuntime.js'

import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiContractsV2'

const markdownPayload = (markdown = '') => ({ markdown: String(markdown ?? '') })
const selectionPayload = (markdown = '', selection) => ({
  markdown: String(markdown ?? ''),
  ...(selection === undefined ? {} : { selection })
})

export const createEditorEngineClients = (call) => {
  const markdown = {
    parse: (source = '') => call(API.MARKDOWN_PARSE, markdownPayload(source)),
    renderHtml: (source = '') => call(API.MARKDOWN_RENDER_HTML, markdownPayload(source)),
    toText: (source = '') => call(API.MARKDOWN_TO_TEXT, markdownPayload(source)),
    extractFrontmatter: (source = '') =>
      call(API.MARKDOWN_EXTRACT_FRONTMATTER, markdownPayload(source)),
    extractLinks: (source = '') => call(API.MARKDOWN_EXTRACT_LINKS, markdownPayload(source))
  }

  const editorEngine = {
    parse: (source = '') => call(API.MUYA_PARSE, markdownPayload(source)),
    renderHtml: (source = '') => call(API.MUYA_RENDER_HTML, markdownPayload(source)),
    tokens: (source = '') => call(API.MUYA_TOKENS, markdownPayload(source)),
    extras: (source = '') => call(API.MUYA_EXTRAS, markdownPayload(source)),
    contract: (source = '') => call(API.MUYA_CONTRACT, markdownPayload(source)),
    clipboard: (source = '', selection) =>
      call(API.MUYA_CLIPBOARD, selectionPayload(source, selection)),
    copyMarkdown: (source = '', selection) =>
      call(API.MUYA_COPY_MARKDOWN, selectionPayload(source, selection)),
    copyHtml: (source = '', selection) =>
      call(API.MUYA_COPY_HTML, selectionPayload(source, selection)),
    paste: (state, text = '') => call(API.MUYA_PASTE, { state, text: String(text ?? '') }),
    backspace: (state) => call(API.MUYA_BACKSPACE, { state }),
    removeNext: (state) => call(API.MUYA_REMOVE_NEXT, { state }),
    undo: (state) => call(API.MUYA_UNDO, { state }),
    redo: (state) => call(API.MUYA_REDO, { state }),
    moveCursor: (source, cursor, direction, extend = false, anchor) =>
      call(API.MUYA_MOVE_CURSOR, {
        markdown: String(source ?? ''),
        cursor,
        direction,
        extend,
        ...(anchor === undefined ? {} : { anchor })
      }),
    inputRule: (lineBeforeCursor = '') =>
      call(API.MUYA_INPUT_RULE, { lineBeforeCursor: String(lineBeforeCursor ?? '') }),
    tableInsertRow: (source, rowIndex) =>
      call(API.MUYA_TABLE_INSERT_ROW, { markdown: String(source ?? ''), rowIndex }),
    tableInsertColumn: (source, columnIndex) =>
      call(API.MUYA_TABLE_INSERT_COLUMN, { markdown: String(source ?? ''), columnIndex }),
    tableContract: (source = '') => call(API.MUYA_TABLE_CONTRACT, markdownPayload(source)),
    imageSelection: (source, cursor) =>
      call(API.MUYA_IMAGE_SELECTION, { markdown: String(source ?? ''), cursor }),
    startComposition: (state) => call(API.MUYA_START_COMPOSITION, { state }),
    updateComposition: (state, text = '') =>
      call(API.MUYA_UPDATE_COMPOSITION, { state, text: String(text ?? '') }),
    commitComposition: (state) => call(API.MUYA_COMMIT_COMPOSITION, { state }),
    cancelComposition: (state) => call(API.MUYA_CANCEL_COMPOSITION, { state }),
    editorSnapshot: (state) => call(API.MUYA_EDITOR_SNAPSHOT, { state })
  }

  return {
    markdown,
    editorEngine,
    muya: editorEngine
  }
}

import { describe, expect, it, vi } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  validateApiPayload
} from 'common/elephantnote/apiContractsV2'
import { createEditorEngineClients } from 'elephant-front/services/elephantnoteClient/editorEngineClients'
import { createPlatformCompatibilityAdapter } from 'elephant-front/services/elephantnoteClient/platformCompatibilityAdapter'

const state = { markdown: '# Note', cursor: 3, selectionStart: 3, selectionEnd: 3 }
const selection = { start: 0, end: 4 }

const CLIENT_CASES = [
  ['markdown.parse', ['# Note'], API.MARKDOWN_PARSE, { markdown: '# Note' }],
  ['markdown.renderHtml', ['# Note'], API.MARKDOWN_RENDER_HTML, { markdown: '# Note' }],
  ['markdown.toText', ['# Note'], API.MARKDOWN_TO_TEXT, { markdown: '# Note' }],
  ['markdown.extractFrontmatter', ['---\ntitle: Note\n---\nBody'], API.MARKDOWN_EXTRACT_FRONTMATTER, { markdown: '---\ntitle: Note\n---\nBody' }],
  ['markdown.extractLinks', ['[Link](Note.md)'], API.MARKDOWN_EXTRACT_LINKS, { markdown: '[Link](Note.md)' }],
  ['editorEngine.parse', ['# Note'], API.MUYA_PARSE, { markdown: '# Note' }],
  ['editorEngine.renderHtml', ['# Note'], API.MUYA_RENDER_HTML, { markdown: '# Note' }],
  ['editorEngine.tokens', ['# Note'], API.MUYA_TOKENS, { markdown: '# Note' }],
  ['editorEngine.extras', ['# Note'], API.MUYA_EXTRAS, { markdown: '# Note' }],
  ['editorEngine.contract', ['# Note'], API.MUYA_CONTRACT, { markdown: '# Note' }],
  ['editorEngine.clipboard', ['# Note', selection], API.MUYA_CLIPBOARD, { markdown: '# Note', selection }],
  ['editorEngine.copyMarkdown', ['# Note', selection], API.MUYA_COPY_MARKDOWN, { markdown: '# Note', selection }],
  ['editorEngine.copyHtml', ['# Note', selection], API.MUYA_COPY_HTML, { markdown: '# Note', selection }],
  ['editorEngine.paste', [state, 'text'], API.MUYA_PASTE, { state, text: 'text' }],
  ['editorEngine.backspace', [state], API.MUYA_BACKSPACE, { state }],
  ['editorEngine.removeNext', [state], API.MUYA_REMOVE_NEXT, { state }],
  ['editorEngine.undo', [state], API.MUYA_UNDO, { state }],
  ['editorEngine.redo', [state], API.MUYA_REDO, { state }],
  ['editorEngine.moveCursor', ['# Note', 2, 'right', true, 1], API.MUYA_MOVE_CURSOR, { markdown: '# Note', cursor: 2, direction: 'right', extend: true, anchor: 1 }],
  ['editorEngine.inputRule', ['- '], API.MUYA_INPUT_RULE, { lineBeforeCursor: '- ' }],
  ['editorEngine.tableInsertRow', ['| A |\n| - |', 1], API.MUYA_TABLE_INSERT_ROW, { markdown: '| A |\n| - |', rowIndex: 1 }],
  ['editorEngine.tableInsertColumn', ['| A |\n| - |', 1], API.MUYA_TABLE_INSERT_COLUMN, { markdown: '| A |\n| - |', columnIndex: 1 }],
  ['editorEngine.tableContract', ['| A |\n| - |'], API.MUYA_TABLE_CONTRACT, { markdown: '| A |\n| - |' }],
  ['editorEngine.imageSelection', ['![x](a.png)', 3], API.MUYA_IMAGE_SELECTION, { markdown: '![x](a.png)', cursor: 3 }],
  ['editorEngine.startComposition', [state], API.MUYA_START_COMPOSITION, { state }],
  ['editorEngine.updateComposition', [state, 'é'], API.MUYA_UPDATE_COMPOSITION, { state, text: 'é' }],
  ['editorEngine.commitComposition', [state], API.MUYA_COMMIT_COMPOSITION, { state }],
  ['editorEngine.cancelComposition', [state], API.MUYA_CANCEL_COMPOSITION, { state }],
  ['editorEngine.editorSnapshot', [state], API.MUYA_EDITOR_SNAPSHOT, { state }]
]

const VALIDATION_CASES = CLIENT_CASES.map(([path, args, action, payload]) => ({
  path,
  args,
  action,
  payload
}))

const resolveMethod = (client, path) =>
  path.split('.').reduce((value, key) => value?.[key], client)

const BRIDGE_METHODS = {
  [API.MARKDOWN_PARSE]: ['markdown', 'parse'],
  [API.MARKDOWN_RENDER_HTML]: ['markdown', 'renderHtml'],
  [API.MARKDOWN_TO_TEXT]: ['markdown', 'toText'],
  [API.MARKDOWN_EXTRACT_FRONTMATTER]: ['markdown', 'extractFrontmatter'],
  [API.MARKDOWN_EXTRACT_LINKS]: ['markdown', 'extractLinks'],
  [API.MUYA_PARSE]: ['muya', 'parse'],
  [API.MUYA_RENDER_HTML]: ['muya', 'renderHtml'],
  [API.MUYA_TOKENS]: ['muya', 'tokens'],
  [API.MUYA_EXTRAS]: ['muya', 'extras'],
  [API.MUYA_CONTRACT]: ['muya', 'contract'],
  [API.MUYA_CLIPBOARD]: ['muya', 'clipboard'],
  [API.MUYA_COPY_MARKDOWN]: ['muya', 'copyMarkdown'],
  [API.MUYA_COPY_HTML]: ['muya', 'copyHtml'],
  [API.MUYA_PASTE]: ['muya', 'paste'],
  [API.MUYA_BACKSPACE]: ['muya', 'backspace'],
  [API.MUYA_REMOVE_NEXT]: ['muya', 'removeNext'],
  [API.MUYA_UNDO]: ['muya', 'undo'],
  [API.MUYA_REDO]: ['muya', 'redo'],
  [API.MUYA_MOVE_CURSOR]: ['muya', 'moveCursor'],
  [API.MUYA_INPUT_RULE]: ['muya', 'inputRule'],
  [API.MUYA_TABLE_INSERT_ROW]: ['muya', 'tableInsertRow'],
  [API.MUYA_TABLE_INSERT_COLUMN]: ['muya', 'tableInsertColumn'],
  [API.MUYA_TABLE_CONTRACT]: ['muya', 'tableContract'],
  [API.MUYA_IMAGE_SELECTION]: ['muya', 'imageSelection'],
  [API.MUYA_START_COMPOSITION]: ['muya', 'startComposition'],
  [API.MUYA_UPDATE_COMPOSITION]: ['muya', 'updateComposition'],
  [API.MUYA_COMMIT_COMPOSITION]: ['muya', 'commitComposition'],
  [API.MUYA_CANCEL_COMPOSITION]: ['muya', 'cancelComposition'],
  [API.MUYA_EDITOR_SNAPSHOT]: ['muya', 'editorSnapshot']
}

describe('Markdown and editor engine API matrix', () => {
  it.each(CLIENT_CASES)('%s dispatches the canonical action', async(path, args, action, payload) => {
    const call = vi.fn(async() => ({}))
    const client = createEditorEngineClients(call)
    const method = resolveMethod(client, path)
    expect(typeof method).toBe('function')
    await method(...args)
    expect(call).toHaveBeenCalledWith(action, payload)
  })

  it('keeps the muya compatibility alias identical to editorEngine', () => {
    const client = createEditorEngineClients(vi.fn())
    expect(client.muya).toBe(client.editorEngine)
  })

  it.each(VALIDATION_CASES)('validates the payload emitted by $path', ({ action, payload }) => {
    expect(validateApiPayload(action, payload)).toEqual(payload)
  })

  it.each(Object.entries(BRIDGE_METHODS))('routes %s to its isolated platform method', async(action, [namespace, methodName]) => {
    const method = vi.fn(async(payload) => payload)
    const target = { elephantnote: { [namespace]: { [methodName]: method } } }
    const adapter = createPlatformCompatibilityAdapter(target)
    const matchingCase = CLIENT_CASES.find((entry) => entry[2] === action)
    const payload = matchingCase[3]

    await expect(adapter.call(action, payload)).resolves.toEqual(payload)
    expect(method).toHaveBeenCalledWith(payload)
  })

  it('rejects invalid editor state and cursor payloads before transport', () => {
    expect(() => validateApiPayload(API.MUYA_BACKSPACE, { state: null })).toThrow(/state/i)
    expect(() => validateApiPayload(API.MUYA_MOVE_CURSOR, {
      markdown: '# Note', cursor: '2', direction: 'right'
    })).toThrow(/cursor/i)
    expect(() => validateApiPayload(API.MUYA_IMAGE_SELECTION, {
      markdown: '![x](a.png)', cursor: -1
    })).toThrow(/cursor/i)
    expect(() => validateApiPayload(API.MUYA_TABLE_INSERT_ROW, {
      markdown: '| A |', rowIndex: Number.NaN
    })).toThrow(/rowIndex/i)
  })
})

import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { markdownToJsonState } from '../../../Elephant/frontend/src/renderer/src/muya/jsonStateRuntime.js'
import { createRustBackedMuyaFullEditorRuntime } from '../../../Elephant/frontend/src/renderer/src/muya/rustBackedFullEditorRuntime.js'

const stateFor = (markdown = '') => ({
  markdown,
  selection: { anchor: markdown.length, focus: markdown.length },
  revision: 0,
  undoStack: [],
  redoStack: []
})

const mockRustInvoke = async(command, payload = {}) => {
  if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)

  if (command === 'tauri_muya_engine_query') {
    if (payload.query.type === 'jsonState') return markdownToJsonState(payload.state.markdown)
    throw new Error(`unexpected query: ${payload.query.type}`)
  }

  if (command === 'tauri_muya_engine_apply') {
    const { state, command: editorCommand } = payload
    if (editorCommand.type === 'setSelection') {
      return {
        state: {
          ...state,
          selection: { anchor: editorCommand.anchor, focus: editorCommand.focus }
        },
        documentChanged: false,
        selectionChanged: true
      }
    }
    if (editorCommand.type === 'undo') {
      const previous = state.undoStack.at(-1)
      if (!previous) {
        return { state, documentChanged: false, selectionChanged: false }
      }
      return {
        state: {
          ...state,
          markdown: previous.markdown,
          selection: previous.selection,
          revision: state.revision + 1,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [{ markdown: state.markdown, selection: state.selection }]
        },
        documentChanged: true,
        selectionChanged: true
      }
    }
    throw new Error(`unexpected editor command: ${editorCommand.type}`)
  }

  if (command === 'tauri_muya_engine_commit_composition') {
    const { state, selection, text } = payload
    const start = Math.min(selection.anchor, selection.focus)
    const end = Math.max(selection.anchor, selection.focus)
    const markdown = `${state.markdown.slice(0, start)}${text}${state.markdown.slice(end)}`
    const cursor = start + text.length
    return {
      state: {
        ...state,
        markdown,
        selection: { anchor: cursor, focus: cursor },
        revision: state.revision + 1,
        undoStack: [...state.undoStack, { markdown: state.markdown, selection }],
        redoStack: []
      },
      documentChanged: true,
      selectionChanged: true
    }
  }

  throw new Error(`unexpected command: ${command}`)
}

describe('Rust-backed Muya runtime', () => {
  it('commits one native IME composition and undoes it atomically', async() => {
    const dom = new JSDOM('<div id="editor"></div>')
    const root = dom.window.document.getElementById('editor')
    const runtime = createRustBackedMuyaFullEditorRuntime(root, 'A😀B', {
      document: dom.window.document,
      invoke: mockRustInvoke
    })
    await runtime.readyPromise

    const textNode = root.querySelector('p').firstChild
    const range = dom.window.document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const selection = dom.window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    await runtime.startComposition()
    expect(runtime.composing).toBe(true)

    textNode.nodeValue = 'A漢B'
    await runtime.commitComposition('漢')

    expect(runtime.composing).toBe(false)
    expect(runtime.markdown).toBe('A漢B')
    expect(root.textContent).toBe('A漢B')
    expect(runtime.state.undoStack).toHaveLength(1)

    await runtime.undo()
    expect(runtime.markdown).toBe('A😀B')
    expect(root.textContent).toBe('A😀B')
    expect(runtime.state.undoStack).toHaveLength(0)
  })

  it('cancels native DOM composition without changing Rust state', async() => {
    const dom = new JSDOM('<div id="editor"></div>')
    const root = dom.window.document.getElementById('editor')
    const runtime = createRustBackedMuyaFullEditorRuntime(root, 'base', {
      document: dom.window.document,
      invoke: mockRustInvoke
    })
    await runtime.readyPromise

    await runtime.startComposition()
    root.querySelector('p').textContent = 'temporary'
    await runtime.cancelComposition()

    expect(runtime.markdown).toBe('base')
    expect(root.textContent).toBe('base')
    expect(runtime.state.undoStack).toHaveLength(0)
  })
})

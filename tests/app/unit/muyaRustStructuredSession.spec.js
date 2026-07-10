import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { createRealMuyaRustMirror } from '../../../Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDirectory, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

const view = (state) => ({
  markdown: state.markdown,
  selection: state.selection,
  revision: state.revision,
  undoDepth: state.undoDepth,
  redoDepth: state.redoDepth
})

const createStructuredInvoke = () => {
  let state = {
    markdown: '| A | B |\n| - | - |\n| 1 | 2 |',
    selection: { anchor: 0, focus: 0 },
    revision: 0,
    undoDepth: 0,
    redoDepth: 0
  }

  return vi.fn(async(command, payload = {}) => {
    if (command === 'tauri_muya_session_create') {
      state = { ...state, markdown: payload.markdown }
      return view(state)
    }
    if (command === 'tauri_muya_session_sync_document') {
      state = { ...state, markdown: payload.markdown, selection: payload.selection }
      return { state: view(state), documentChanged: false, selectionChanged: true }
    }
    if (command === 'tauri_muya_session_apply') {
      if (payload.command.type !== 'setSelection') throw new Error('unexpected editor command')
      state = {
        ...state,
        selection: { anchor: payload.command.anchor, focus: payload.command.focus }
      }
      return { state: view(state), documentChanged: false, selectionChanged: true }
    }
    if (command === 'tauri_muya_session_apply_parity') {
      const parity = payload.command
      if (parity.type === 'tableCommand') {
        state = {
          ...state,
          markdown: `${state.markdown}\n|   |   |`,
          revision: state.revision + 1,
          undoDepth: state.undoDepth + 1
        }
      } else if (parity.type === 'applyOperation') {
        const { pos, count, text } = parity.operation
        state = {
          ...state,
          markdown: state.markdown.slice(0, pos) + text + state.markdown.slice(pos + count),
          revision: state.revision + 1,
          undoDepth: state.undoDepth + 1
        }
      } else if (parity.type === 'upsertFootnote') {
        state = {
          ...state,
          markdown: `${state.markdown}\n\n[^${parity.label}]: ${parity.text}\n`,
          revision: state.revision + 1,
          undoDepth: state.undoDepth + 1
        }
      } else {
        throw new Error(`unexpected parity command: ${parity.type}`)
      }
      return { state: view(state), documentChanged: true, selectionChanged: false }
    }
    if (command === 'tauri_muya_session_query') {
      return { type: 'muya-json-state', blocks: [{ type: 'table' }] }
    }
    if (command === 'tauri_muya_session_close') return true
    throw new Error(`unexpected command: ${command}`)
  })
}

describe('structured operations on the Rust-owned Muya session', () => {
  it('routes table, image/text and footnote mutations through session parity IPC', async() => {
    const invoke = createStructuredInvoke()
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: '| A | B |\n| - | - |\n| 1 | 2 |',
      invoke,
      target: {},
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    })
    await mirror.ready

    await mirror.tableCommand('insert_row', 1)
    await mirror.applyOperation({ type: 'insert', pos: 0, count: 0, text: 'Intro\n' })
    await mirror.upsertFootnote('note', '')

    const parityCalls = invoke.mock.calls.filter(([command]) => (
      command === 'tauri_muya_session_apply_parity'
    ))
    expect(parityCalls.map(([, payload]) => payload.command.type)).toEqual([
      'tableCommand',
      'applyOperation',
      'upsertFootnote'
    ])
    for (const [, payload] of parityCalls) {
      expect(payload.editorId).toBe(mirror.sessionId)
      expect(payload.state).toBeUndefined()
      expect(payload.undoStack).toBeUndefined()
    }
    expect(mirror.status.undoDepth).toBe(3)
  })

  it('hooks the original Muya content state instead of replacing its DOM renderer', () => {
    const adapter = read('Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js')

    expect(adapter).toContain('this.contentState.updateParagraph =')
    expect(adapter).toContain('this.contentState.editTable =')
    expect(adapter).toContain('this.contentState.updateImage =')
    expect(adapter).toContain('this.contentState.deleteImage =')
    expect(adapter).toContain('this.contentState.createFootnote =')
    expect(adapter).toContain("engine.tableCommand(context.action, context.index)")
    expect(adapter).toContain('engine.applyOperation(mutation.operation)')
    expect(adapter).toContain("engine.upsertFootnote(label, '')")
    expect(adapter).not.toContain('innerHTML')
    expect(adapter).not.toContain('createElement')
  })
})

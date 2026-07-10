import { describe, expect, it, vi } from 'vitest'

import { createRustMuyaEngineClient } from '../../../Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js'

const compactState = (markdown, revision = 0, selection = null) => ({
  markdown,
  selection: selection || { anchor: markdown.length, focus: markdown.length },
  revision,
  undoDepth: revision > 0 ? 1 : 0,
  redoDepth: 0
})

describe('Rust-owned Muya session client', () => {
  it('sends only editor id and document delta inputs, never history arrays', async() => {
    let state = compactState('')
    const invoke = vi.fn(async(command, payload) => {
      if (command === 'tauri_muya_session_create') {
        state = compactState(payload.markdown)
        return state
      }
      if (command === 'tauri_muya_session_sync_document') {
        state = compactState(payload.markdown, state.revision + 1, payload.selection)
        return { state, documentChanged: true, selectionChanged: true }
      }
      if (command === 'tauri_muya_session_query') {
        return { type: 'muya-json-state', blocks: [] }
      }
      if (command === 'tauri_muya_session_close') return true
      throw new Error(`Unexpected command: ${command}`)
    })
    const client = createRustMuyaEngineClient({
      invoke,
      sessionId: 'muya:test:1'
    })

    await client.create('hello')
    await client.syncDocument('hello!', { anchor: 6, focus: 6 }, true)

    expect(client.usesSession).toBe(true)
    expect(client.sessionId).toBe('muya:test:1')
    expect(client.state.undoStack).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_create', {
      editorId: 'muya:test:1',
      markdown: 'hello'
    })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_sync_document', {
      editorId: 'muya:test:1',
      markdown: 'hello!',
      selection: { anchor: 6, focus: 6 },
      continueGroup: true
    })
    const syncPayload = invoke.mock.calls.find(([command]) => (
      command === 'tauri_muya_session_sync_document'
    ))[1]
    expect(syncPayload.state).toBeUndefined()
    expect(syncPayload.undoStack).toBeUndefined()

    await expect(client.close()).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_close', {
      editorId: 'muya:test:1'
    })
  })

  it('routes mutations and queries to the same Rust session', async() => {
    let state = compactState('text')
    const invoke = vi.fn(async(command, payload) => {
      if (command === 'tauri_muya_session_create') return state
      if (command === 'tauri_muya_session_apply') {
        expect(payload.editorId).toBe('muya:test:2')
        state = compactState('**text**', 1, { anchor: 2, focus: 6 })
        return { state, documentChanged: true, selectionChanged: true }
      }
      if (command === 'tauri_muya_session_apply_parity') {
        expect(payload.editorId).toBe('muya:test:2')
        state = compactState('**text**\n\n[^note]: ', 2)
        return { state, documentChanged: true, selectionChanged: true }
      }
      if (command === 'tauri_muya_session_paste_clipboard') {
        expect(payload.editorId).toBe('muya:test:2')
        state = compactState('**text**\n\n[^note]: **rich**', 3)
        return { state, documentChanged: true, selectionChanged: true }
      }
      if (command === 'tauri_muya_session_query') {
        expect(payload.editorId).toBe('muya:test:2')
        return { type: 'muya-json-state', blocks: [{ type: 'paragraph' }] }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const client = createRustMuyaEngineClient({ invoke, sessionId: 'muya:test:2' })

    await client.create('text')
    const transaction = await client.toggleInline('**')
    const footnote = await client.upsertFootnote('note', '')
    const pasted = await client.pasteClipboard('<strong>rich</strong>', 'rich')
    const jsonState = await client.jsonState()

    expect(transaction.state.markdown).toBe('**text**')
    expect(footnote.state.markdown).toContain('[^note]: ')
    expect(pasted.state.markdown).toContain('**rich**')
    expect(jsonState.blocks).toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_apply', {
      editorId: 'muya:test:2',
      command: { type: 'toggleInline', marker: '**' }
    })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_apply_parity', {
      editorId: 'muya:test:2',
      command: { type: 'upsertFootnote', label: 'note', text: '' }
    })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_session_paste_clipboard', {
      editorId: 'muya:test:2',
      html: '<strong>rich</strong>',
      text: 'rich'
    })
  })

  it('rejects unsafe session identifiers before invoking Tauri', () => {
    expect(() => createRustMuyaEngineClient({
      invoke: vi.fn(),
      sessionId: '../../editor'
    })).toThrow('safe editor session id')
  })
})

import { describe, expect, it } from 'vitest'

import {
  createRustMuyaEngineClient,
  isRustMuyaEngineAvailable
} from '../../../Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js'

const stateFor = (markdown = '') => ({
  markdown,
  selection: { anchor: markdown.length, focus: markdown.length },
  revision: 0,
  undoStack: [],
  redoStack: []
})

describe('Muya Rust engine runtime client', () => {
  it('fails loudly when the Tauri invoke bridge is unavailable', () => {
    expect(() => createRustMuyaEngineClient({ target: {} }))
      .toThrow('requires the Tauri invoke bridge')
  })

  it('uses the exact Tauri commands and carries authoritative state forward', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_apply') {
        return {
          state: {
            ...payload.state,
            markdown: `${payload.state.markdown}!`,
            selection: { anchor: payload.state.markdown.length + 1, focus: payload.state.markdown.length + 1 },
            revision: payload.state.revision + 1
          },
          documentChanged: true,
          selectionChanged: true
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('hello')
    const transaction = await client.insertText('!')

    expect(calls[0]).toEqual({
      command: 'tauri_muya_engine_create',
      payload: { markdown: 'hello' }
    })
    expect(calls[1].command).toBe('tauri_muya_engine_apply')
    expect(calls[1].payload.command).toEqual({ type: 'insertText', text: '!' })
    expect(transaction.documentChanged).toBe(true)
    expect(client.markdown).toBe('hello!')
    expect(client.state.revision).toBe(1)
  })

  it('routes tables images footnotes templates keyboard and OT operations to Rust', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_apply_parity') {
        return {
          state: { ...payload.state, markdown: `${payload.state.markdown}.`, revision: payload.state.revision + 1 },
          documentChanged: true,
          selectionChanged: false
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('x')
    await client.applyOperation({ type: 'replace', pos: 0, count: 1, text: 'y' })
    await client.keyboardRule('Tab', { shiftKey: true })
    await client.tableCommand('align_center', 1)
    await client.resizeImage(3, '50%')
    await client.upsertFootnote('note', 'text')
    await client.insertTemplate('mermaid')

    expect(calls.slice(1).map((entry) => entry.command))
      .toEqual(Array(6).fill('tauri_muya_engine_apply_parity'))
    expect(calls[1].payload.command).toEqual({
      type: 'applyOperation',
      operation: { type: 'replace', pos: 0, count: 1, text: 'y' }
    })
    expect(calls[2].payload.command).toEqual({ type: 'keyboardRule', key: 'Tab', shiftKey: true })
    expect(calls[3].payload.command).toEqual({ type: 'tableCommand', action: 'align_center', index: 1 })
    expect(calls[4].payload.command).toEqual({ type: 'resizeImage', cursor: 3, width: '50%' })
    expect(calls[5].payload.command).toEqual({ type: 'upsertFootnote', label: 'note', text: 'text' })
    expect(calls[6].payload.command).toEqual({ type: 'insertTemplate', id: 'mermaid' })
    expect(client.state.revision).toBe(6)
  })

  it('routes clipboard image footnote slash and preview descriptors to Rust', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_query') return { queryType: payload.query.type }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('A[^n]')
    await client.clipboard()
    await client.imageToolbar(2)
    await client.footnotePopup()
    await client.slashCommands('/mer')
    await client.previewDescriptor('code_fence', 'mermaid', 'graph TD')

    expect(calls.slice(1).map((entry) => entry.command))
      .toEqual(Array(5).fill('tauri_muya_engine_query'))
    expect(calls[1].payload.query).toEqual({ type: 'clipboard' })
    expect(calls[2].payload.query).toEqual({ type: 'imageToolbar', cursor: 2 })
    expect(calls[3].payload.query).toEqual({ type: 'footnotePopup', cursor: null })
    expect(calls[4].payload.query).toEqual({ type: 'slashCommands', query: '/mer' })
    expect(calls[5].payload.query).toEqual({
      type: 'previewDescriptor',
      blockType: 'code_fence',
      language: 'mermaid',
      text: 'graph TD'
    })
    expect(calls[4].payload.state.markdown).toBe('A[^n]')
  })

  it('allows stateless slash and preview queries but rejects stateful queries before create', async() => {
    const invoke = async(command, payload = {}) => {
      expect(command).toBe('tauri_muya_engine_query')
      expect(payload.state).toBeNull()
      return []
    }
    const client = createRustMuyaEngineClient({ invoke })
    await client.slashCommands('table')
    await client.previewDescriptor('paragraph', null, 'x')
    await expect(client.clipboard()).rejects.toThrow('initialized')
  })

  it('commits IME text with one dedicated Rust transaction', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_commit_composition') {
        return {
          state: {
            ...payload.state,
            markdown: 'A漢B',
            selection: { anchor: 2, focus: 2 },
            revision: 1,
            undoStack: [{ markdown: 'A😀B', selection: payload.selection }]
          },
          documentChanged: true,
          selectionChanged: true
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('A😀B')
    const transaction = await client.commitComposition({ anchor: 1, focus: 3 }, '漢')

    expect(calls[1]).toEqual({
      command: 'tauri_muya_engine_commit_composition',
      payload: {
        state: stateFor('A😀B'),
        selection: { anchor: 1, focus: 3 },
        text: '漢'
      }
    })
    expect(transaction.state.undoStack).toHaveLength(1)
    expect(client.markdown).toBe('A漢B')
  })

  it('rejects malformed IME selections before invoking Rust', async() => {
    let calls = 0
    const invoke = async(command, payload = {}) => {
      calls += 1
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      throw new Error('must not be called')
    }
    const client = createRustMuyaEngineClient({ invoke })
    await client.create('text')
    await expect(client.commitComposition({ anchor: 1.5, focus: 2 }, 'x'))
      .rejects.toThrow('valid UTF-16 selection')
    expect(calls).toBe(1)
  })

  it('sends batches as one backend request', async() => {
    const invoke = async(command, payload = {}) => {
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_apply_batch') {
        return {
          state: {
            ...payload.state,
            markdown: '# Title',
            selection: { anchor: 7, focus: 7 },
            revision: 2
          },
          documentChanged: true,
          selectionChanged: true
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('')
    await client.applyBatch([
      { type: 'insertText', text: 'Title' },
      { type: 'transformBlock', kind: 'heading1' }
    ])

    expect(client.markdown).toBe('# Title')
    expect(client.state.revision).toBe(2)
  })

  it('binds ipcRenderer invoke so bridge methods keep their receiver', async() => {
    const bridge = {
      marker: 'bridge',
      async invoke(command, payload) {
        expect(this.marker).toBe('bridge')
        expect(command).toBe('tauri_muya_engine_create')
        return stateFor(payload.markdown)
      }
    }
    const client = createRustMuyaEngineClient({ target: { tauri: { ipcRenderer: bridge } } })
    await client.create('bound')
    expect(client.markdown).toBe('bound')
  })

  it('detects both supported Tauri invoke surfaces', () => {
    expect(isRustMuyaEngineAvailable({ tauri: { ipcRenderer: { invoke() {} } } })).toBe(true)
    expect(isRustMuyaEngineAvailable({ __TAURI__: { core: { invoke() {} } } })).toBe(true)
    expect(isRustMuyaEngineAvailable({})).toBe(false)
  })
})

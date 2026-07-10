import { describe, expect, it } from 'vitest'

import {
  createRustMuyaEngineClient,
  isRustMuyaEngineAvailable
} from '../../../Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js'

describe('Muya Rust engine runtime client', () => {
  it('fails loudly when the Tauri invoke bridge is unavailable', () => {
    expect(() => createRustMuyaEngineClient({ target: {} }))
      .toThrow('requires the Tauri invoke bridge')
  })

  it('uses the exact Tauri commands and carries authoritative state forward', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') {
        return {
          markdown: payload.markdown,
          selection: { anchor: payload.markdown.length, focus: payload.markdown.length },
          revision: 0,
          undoStack: [],
          redoStack: []
        }
      }
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

  it('sends batches as one backend request', async() => {
    const invoke = async(command, payload = {}) => {
      if (command === 'tauri_muya_engine_create') {
        return {
          markdown: payload.markdown,
          selection: { anchor: 0, focus: 0 },
          revision: 0,
          undoStack: [],
          redoStack: []
        }
      }
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

  it('detects both supported Tauri invoke surfaces', () => {
    expect(isRustMuyaEngineAvailable({ tauri: { ipcRenderer: { invoke() {} } } })).toBe(true)
    expect(isRustMuyaEngineAvailable({ __TAURI__: { core: { invoke() {} } } })).toBe(true)
    expect(isRustMuyaEngineAvailable({})).toBe(false)
  })
})

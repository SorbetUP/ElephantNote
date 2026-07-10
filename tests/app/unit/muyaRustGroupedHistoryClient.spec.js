import { describe, expect, it } from 'vitest'

import { createRustMuyaEngineClient } from '../../../Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js'

const stateFor = (markdown = '') => ({
  markdown,
  selection: { anchor: markdown.length, focus: markdown.length },
  revision: 0,
  undoStack: [],
  redoStack: []
})

describe('Muya Rust grouped history client', () => {
  it('sends the group continuation flag and keeps returned state authoritative', async() => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })
      if (command === 'tauri_muya_engine_create') return stateFor(payload.markdown)
      if (command === 'tauri_muya_engine_apply_grouped') {
        return {
          state: {
            ...payload.state,
            markdown: payload.command.text,
            selection: {
              anchor: payload.command.text.length,
              focus: payload.command.text.length
            },
            revision: payload.state.revision + 1,
            undoStack: [{ markdown: '', selection: { anchor: 0, focus: 0 } }]
          },
          documentChanged: true,
          selectionChanged: true
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const client = createRustMuyaEngineClient({ invoke })
    await client.create('')
    await client.applyGrouped({ type: 'replaceSelection', text: 'a' }, false)
    await client.applyGrouped({ type: 'replaceSelection', text: 'ab' }, true)

    expect(calls[1]).toMatchObject({
      command: 'tauri_muya_engine_apply_grouped',
      payload: {
        command: { type: 'replaceSelection', text: 'a' },
        continueGroup: false
      }
    })
    expect(calls[2]).toMatchObject({
      command: 'tauri_muya_engine_apply_grouped',
      payload: {
        command: { type: 'replaceSelection', text: 'ab' },
        continueGroup: true
      }
    })
    expect(client.markdown).toBe('ab')
    expect(client.state.undoStack).toHaveLength(1)
  })
})

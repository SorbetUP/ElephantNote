import { describe, expect, it, vi } from 'vitest'

import { createRustMuyaEngineClient } from '../../../Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js'

const state = (markdown, revision = 0) => ({
  markdown,
  selection: { anchor: markdown.length, focus: markdown.length },
  revision,
  undoDepth: revision,
  redoDepth: 0
})

describe('complete Rust Muya session commands', () => {
  it('sends typed complete commands without JavaScript history or document snapshots', async() => {
    let current = state('alpha')
    const invoke = vi.fn(async(command, payload) => {
      if (command === 'tauri_muya_session_create') return current
      if (command === 'tauri_muya_session_apply_complete') {
        expect(payload.editorId).toBe('muya:complete:test')
        expect(payload.state).toBeUndefined()
        expect(payload.undoStack).toBeUndefined()
        current = state(`${current.markdown}!`, current.revision + 1)
        return { state: current, documentChanged: true, selectionChanged: true }
      }
      throw new Error(`unexpected command: ${command}`)
    })
    const client = createRustMuyaEngineClient({
      invoke,
      sessionId: 'muya:complete:test'
    })

    await client.create('alpha')
    await client.replaceRange(0, 5, 'beta')
    await client.duplicateBlock()
    await client.deleteBlock()
    await client.indentSelection({ outdent: false, width: 2 })
    await client.toggleTask()
    await client.insertLink('https://example.com', 'Example')
    await client.removeLink()
    await client.searchReplace({ query: 'beta', replacement: 'gamma', replaceAll: true })
    await client.selectAll()

    const commandTypes = invoke.mock.calls
      .filter(([command]) => command === 'tauri_muya_session_apply_complete')
      .map(([, payload]) => payload.command.type)

    expect(commandTypes).toEqual([
      'replaceRange',
      'duplicateBlock',
      'deleteBlock',
      'indentSelection',
      'toggleTask',
      'insertLink',
      'removeLink',
      'searchReplace',
      'selectAll'
    ])
  })
})

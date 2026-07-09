import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokeKnowledgeCommand } from '../../../../Elephant/frontend/src/renderer/src/platform/knowledgeRuntimeClient.js'

afterEach(() => {
  delete globalThis.__TAURI__
  vi.restoreAllMocks()
})

const installMockCore = (handler) => {
  const invoke = vi.fn(handler)
  globalThis.__TAURI__ = { core: { invoke } }
  return invoke
}

describe('knowledgeRuntimeClient logging', () => {
  it('logs start and completion around every command', async() => {
    const invoke = installMockCore(async(command) => {
      if (command === 'tauri_debug_log') return true
      return { documents: 3 }
    })

    const result = await invokeKnowledgeCommand('tauri_knowledge_status')

    expect(result).toEqual({ documents: 3 })
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'tauri_debug_log',
      'tauri_knowledge_status',
      'tauri_debug_log'
    ])
    expect(invoke.mock.calls[0][1]).toMatchObject({
      level: 'debug',
      message: '[KnowledgeRuntime] command:start',
      details: { command: 'tauri_knowledge_status' }
    })
    expect(invoke.mock.calls[2][1]).toMatchObject({
      level: 'info',
      message: '[KnowledgeRuntime] command:complete',
      details: {
        command: 'tauri_knowledge_status',
        resultType: 'object'
      }
    })
  })

  it('logs only safe metadata instead of note or query contents', async() => {
    const invoke = installMockCore(async(command) => command === 'tauri_debug_log' ? true : [])
    const query = 'private medical search text'

    await invokeKnowledgeCommand('tauri_knowledge_search', { query, limit: 12 })

    const startDetails = invoke.mock.calls[0][1].details
    expect(startDetails).toMatchObject({
      command: 'tauri_knowledge_search',
      limit: 12,
      queryLength: query.length
    })
    expect(JSON.stringify(startDetails)).not.toContain(query)
  })

  it('logs failures and rethrows the original error', async() => {
    const failure = new Error('database unavailable')
    const invoke = installMockCore(async(command) => {
      if (command === 'tauri_debug_log') return true
      throw failure
    })

    await expect(invokeKnowledgeCommand('tauri_knowledge_rebuild')).rejects.toBe(failure)

    expect(invoke.mock.calls.at(-1)[1]).toMatchObject({
      level: 'error',
      message: '[KnowledgeRuntime] command:error',
      details: {
        command: 'tauri_knowledge_rebuild',
        error: 'database unavailable'
      }
    })
  })
})

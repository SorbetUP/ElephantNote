import { afterEach, describe, expect, it, vi } from 'vitest'
import { installKnowledgeRuntimeBridge } from '../../../../Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js'
import { invokeKnowledgeCommand } from '../../../../Elephant/frontend/src/renderer/src/platform/knowledgeRuntimeClient.js'

afterEach(() => {
  delete globalThis.__TAURI__
  delete globalThis.elephantnote
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

describe('knowledge runtime startup regressions', () => {
  it('does not rebuild on vault initialization and bounds the renderer graph', async() => {
    const graphNodes = Array.from({ length: 400 }, (_, index) => ({
      id: `Note-${index}.md`,
      path: `Note-${index}.md`,
      relativePath: `Note-${index}.md`,
      title: `Note ${index}`,
      kind: 'note',
      type: 'note'
    }))
    const invoke = installMockCore(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') {
        return { documents: 1389, database_path: '/vault/.elephantnote/knowledge/knowledge.sqlite' }
      }
      if (command === 'tauri_knowledge_search') {
        return [{
          relative_path: 'test_keep/Chess.md',
          chunk_id: 'chunk-1',
          start_offset: 4,
          end_offset: 18,
          title: 'Chess',
          excerpt: 'Chess note'
        }]
      }
      if (command === 'tauri_knowledge_graph') {
        return { nodes: graphNodes, edges: [], clusters: [] }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    globalThis.elephantnote = {}
    expect(installKnowledgeRuntimeBridge(globalThis)).toBe(true)

    const status = await globalThis.elephantnote.search.initVault({ vaultPath: '/vault' })
    expect(status).toMatchObject({
      status: 'ready',
      vaultPath: '/vault',
      indexedDocuments: 1389
    })
    expect(invoke.mock.calls.some(([command]) => command === 'tauri_knowledge_rebuild')).toBe(false)

    const results = await globalThis.elephantnote.search.query({ query: 'ch', limit: 20 })
    expect(results).toEqual([expect.objectContaining({
      relativePath: 'test_keep/Chess.md',
      path: 'test_keep/Chess.md',
      chunkId: 'chunk-1',
      startOffset: 4,
      endOffset: 18
    })])

    const inspection = await globalThis.elephantnote.search.inspect()
    expect(inspection.graph).toMatchObject({
      rendererLimited: true,
      totalNodeCount: 400,
      hiddenNodeCount: 80
    })
    expect(inspection.graph.nodes).toHaveLength(320)
    expect(inspection.documents).toHaveLength(320)
    expect(invoke.mock.calls.some(([command]) => command === 'tauri_knowledge_rebuild')).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

const loadBridge = async(invoke) => {
  vi.resetModules()
  globalThis.__TAURI__ = { core: { invoke } }
  globalThis.window = globalThis
  globalThis.elephantnote = {}
  return import('../../../../Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js')
}

afterEach(() => {
  delete globalThis.__TAURI__
  delete globalThis.elephantnote
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('knowledge search bridge initialization', () => {
  it('normalizes initVault object payloads and does not rebuild automatically', async() => {
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') return { documents: 0, chunks: 0 }
      if (command === 'tauri_knowledge_rebuild') throw new Error('rebuild should be explicit')
      return null
    })
    const { installKnowledgeRuntimeBridge } = await loadBridge(invoke)
    expect(installKnowledgeRuntimeBridge(globalThis)).toBe(true)

    const status = await globalThis.elephantnote.search.initVault({ vaultPath: '/vault/A' })

    expect(status).toMatchObject({
      vaultPath: '/vault/A',
      status: 'empty',
      indexedDocuments: 0
    })
    expect(invoke.mock.calls.some(([command]) => command === 'tauri_knowledge_rebuild')).toBe(false)
  })

  it('deduplicates concurrent initVault calls for the same vault', async() => {
    let statusCalls = 0
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') {
        statusCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        return { documents: 12, chunks: 24 }
      }
      return null
    })
    const { installKnowledgeRuntimeBridge } = await loadBridge(invoke)
    installKnowledgeRuntimeBridge(globalThis)

    const [left, right] = await Promise.all([
      globalThis.elephantnote.search.initVault({ vaultPath: '/vault/A' }),
      globalThis.elephantnote.search.initVault({ vaultPath: '/vault/A' })
    ])

    expect(left.indexedDocuments).toBe(12)
    expect(right.indexedDocuments).toBe(12)
    expect(statusCalls).toBe(1)
  })

  it('limits large graph inspections before exposing documents to the renderer', async() => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      id: `Note-${index}.md`,
      path: `Note-${index}.md`,
      title: `Note ${index}`,
      kind: 'note'
    }))
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') return { documents: 500, chunks: 500 }
      if (command === 'tauri_knowledge_graph') return { nodes, edges: [], clusters: [] }
      return null
    })
    const { installKnowledgeRuntimeBridge } = await loadBridge(invoke)
    installKnowledgeRuntimeBridge(globalThis)

    await globalThis.elephantnote.search.initVault({ vaultPath: '/vault/A' })
    const inspection = await globalThis.elephantnote.search.inspect()

    expect(inspection.graph.rendererLimited).toBe(true)
    expect(inspection.graph.nodes).toHaveLength(320)
    expect(inspection.documents).toHaveLength(320)
  })
})

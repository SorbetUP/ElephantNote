import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const repositoryFile = (relativePath) => readFileSync(
  fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)),
  'utf8'
)

const installTarget = (invoke) => {
  globalThis.__TAURI__ = { core: { invoke } }
  globalThis.window = globalThis
  globalThis.elephantnote = {}
}

const loadFacadeOnlyBridge = async(invoke) => {
  vi.resetModules()
  installTarget(invoke)
  return import('../../../../Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js')
}

const loadRealTauriBridge = async(invoke) => {
  vi.resetModules()
  installTarget(invoke)
  const [{ installTauriElephantNoteBridge }, { installKnowledgeRuntimeBridge }] = await Promise.all([
    import('../../../../Elephant/frontend/src/renderer/src/platform/tauriElephantNoteBridge.js'),
    import('../../../../Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js')
  ])
  expect(installTauriElephantNoteBridge(globalThis)).toBe(true)
  expect(installKnowledgeRuntimeBridge(globalThis)).toBe(true)
  return globalThis.elephantnote
}

afterEach(() => {
  delete globalThis.__TAURI__
  delete globalThis.elephantnote
  delete globalThis.window
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('knowledge search bridge initialization', () => {
  it('contains no implicit rebuild path in the native bridge or chat client', () => {
    const nativeBridge = repositoryFile('Elephant/frontend/src/renderer/src/platform/tauriElephantNoteBridge.js')
    const domainClients = repositoryFile('Elephant/frontend/app/services/elephantnoteClient/domainClients.js')

    expect(nativeBridge).not.toContain("initVault: () => invoke(target, 'tauri_knowledge_rebuild')")
    expect(nativeBridge).toContain("initVault: async(payload = '')")
    expect(domainClients).not.toContain('SEARCH_REBUILD')
    expect(domainClients).not.toContain('shouldRebuildChatSearch')
    expect(domainClients).not.toContain('ensureSearchVaultForChat')
  })

  it('normalizes initVault object payloads and does not rebuild automatically', async() => {
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') return { documents: 0, chunks: 0 }
      if (command === 'tauri_knowledge_rebuild') throw new Error('rebuild should be explicit')
      return null
    })
    const { installKnowledgeRuntimeBridge } = await loadFacadeOnlyBridge(invoke)
    expect(installKnowledgeRuntimeBridge(globalThis)).toBe(true)

    const status = await globalThis.elephantnote.search.initVault({ vaultPath: '/vault/A' })

    expect(status).toMatchObject({
      vaultPath: '/vault/A',
      status: 'empty',
      indexedDocuments: 0
    })
    expect(invoke.mock.calls.some(([command]) => command === 'tauri_knowledge_rebuild')).toBe(false)
  })

  it('intercepts the real api.call closure used by elephantnoteClient', async() => {
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_status') {
        return {
          documents: 1389,
          chunks: 2200,
          database_path: '/vault/A/.elephantnote/knowledge/knowledge.sqlite'
        }
      }
      if (command === 'tauri_knowledge_rebuild') {
        throw new Error('initVault incorrectly reached rebuild')
      }
      return null
    })
    const bridge = await loadRealTauriBridge(invoke)

    const envelope = await bridge.api.call('search.initVault', { vaultPath: '/vault/A' })

    expect(envelope).toMatchObject({
      ok: true,
      data: {
        vaultPath: '/vault/A',
        status: 'ready',
        indexedDocuments: 1389,
        databasePath: '/vault/A/.elephantnote/knowledge/knowledge.sqlite'
      }
    })
    expect(invoke.mock.calls.some(([command]) => command === 'tauri_knowledge_rebuild')).toBe(false)
    expect(invoke.mock.calls.filter(([command]) => command === 'tauri_knowledge_status')).toHaveLength(1)
  })

  it('deduplicates concurrent api.call initVault calls for the same vault', async() => {
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
    const bridge = await loadRealTauriBridge(invoke)

    const [left, right] = await Promise.all([
      bridge.api.call('search.initVault', { vaultPath: '/vault/A' }),
      bridge.api.call('search.initVault', { vaultPath: '/vault/A' })
    ])

    expect(left.data.indexedDocuments).toBe(12)
    expect(right.data.indexedDocuments).toBe(12)
    expect(statusCalls).toBe(1)
  })

  it('limits large graph inspections on the real API path before rendering', async() => {
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
    const bridge = await loadRealTauriBridge(invoke)

    await bridge.api.call('search.initVault', { vaultPath: '/vault/A' })
    const envelope = await bridge.api.call('search.inspect', {})
    const inspection = envelope.data

    expect(inspection.graph.rendererLimited).toBe(true)
    expect(inspection.graph.nodes).toHaveLength(240)
    expect(inspection.graph.hiddenNodeCount).toBe(260)
    expect(inspection.documents).toHaveLength(240)
  })

  it('runs a rebuild only through the explicit search.rebuild action and then settles', async() => {
    const invoke = vi.fn(async(command) => {
      if (command === 'tauri_debug_log') return true
      if (command === 'tauri_knowledge_rebuild') {
        return { scanned: 10, indexed: 2, unchanged: 8, removed: 0, failed: [] }
      }
      if (command === 'tauri_knowledge_status') return { documents: 10, chunks: 20 }
      return null
    })
    const bridge = await loadRealTauriBridge(invoke)

    const rebuildEnvelope = await bridge.api.call('search.rebuild', { vaultPath: '/vault/A' })
    const settledEnvelope = await bridge.api.call('search.status', { vaultPath: '/vault/A' })

    expect(rebuildEnvelope.data).toMatchObject({
      status: 'indexing',
      indexedDocuments: 10,
      rebuildReport: { scanned: 10, indexed: 2, unchanged: 8 }
    })
    expect(settledEnvelope.data).toMatchObject({
      status: 'ready',
      indexedDocuments: 10,
      vaultPath: '/vault/A'
    })
    expect(invoke.mock.calls.filter(([command]) => command === 'tauri_knowledge_rebuild')).toHaveLength(1)
  })
})

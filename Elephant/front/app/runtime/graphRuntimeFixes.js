import { pushDiagnosticLog } from '@/platform/rendererDiagnostics'
import { useSearchStore } from '../stores/searchStore'
import { useVaultStore } from '../stores/vaultStore'

let installed = false
let repairInFlight = false
let lastRepairVaultPath = ''

const graphCounts = (searchStore) => {
  const graph = searchStore?.indexInspection?.graph
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edges: Array.isArray(graph?.edges) ? graph.edges.length : 0,
    clusters: Array.isArray(graph?.clusters) ? graph.clusters.length : 0,
    documents: Array.isArray(searchStore?.indexInspection?.documents)
      ? searchStore.indexInspection.documents.length
      : 0,
    semanticLinks: Array.isArray(searchStore?.indexInspection?.semanticLinks)
      ? searchStore.indexInspection.semanticLinks.length
      : 0
  }
}

export const hasSparseGraph = (searchStore) => {
  const graph = searchStore?.indexInspection?.graph
  const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0
  return nodeCount <= 1
}

export const hasSubstantialVault = (vaultStore) => {
  const entries = Array.isArray(vaultStore?.rootEntries) ? vaultStore.rootEntries : []
  if (entries.length > 8) return true
  return entries.some((entry) => entry?.kind === 'folder' || entry?.type === 'folder')
}

export const shouldRepairSparseGraph = ({ vaultStore, searchStore, vaultPath, lastRepairPath = '', inFlight = false } = {}) => {
  if (vaultStore?.activeWorkspaceView !== 'graph') return false
  if (!vaultPath || inFlight) return false
  if (lastRepairPath === vaultPath) return false
  return hasSparseGraph(searchStore) && hasSubstantialVault(vaultStore)
}

export const installGraphRuntimeFixes = () => {
  if (installed) return
  installed = true
  pushDiagnosticLog('info', 'graph runtime repair guard installed')

  const repairGraphIfNeeded = async () => {
    const vaultStore = useVaultStore()
    const searchStore = useSearchStore()
    const vaultPath = vaultStore.activeVault?.path || searchStore.vaultPath || ''
    const countsBefore = graphCounts(searchStore)

    if (!shouldRepairSparseGraph({
      vaultStore,
      searchStore,
      vaultPath,
      lastRepairPath: lastRepairVaultPath,
      inFlight: repairInFlight
    })) return

    repairInFlight = true
    lastRepairVaultPath = vaultPath
    pushDiagnosticLog('warn', 'graph sparse index detected; rebuilding search index', {
      vaultPath,
      rootEntries: Array.isArray(vaultStore.rootEntries) ? vaultStore.rootEntries.length : 0,
      ...countsBefore
    })

    try {
      const rebuildStatus = await searchStore.rebuild()
      await searchStore.inspect()
      pushDiagnosticLog('info', 'graph sparse index rebuild finished', {
        vaultPath,
        rebuildStatus: rebuildStatus || searchStore.status || null,
        before: countsBefore,
        after: graphCounts(searchStore)
      })
    } catch (error) {
      pushDiagnosticLog('error', 'graph sparse index rebuild failed', {
        vaultPath,
        before: countsBefore,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack || '' }
          : String(error || '')
      })
      console.warn('Unable to repair sparse graph index:', error)
    } finally {
      repairInFlight = false
    }
  }

  window.addEventListener('elephantnote:repair-graph', repairGraphIfNeeded)
  window.setInterval(() => {
    repairGraphIfNeeded().catch((error) => {
      pushDiagnosticLog('error', 'graph repair interval failed', error)
    })
  }, 1500)
}

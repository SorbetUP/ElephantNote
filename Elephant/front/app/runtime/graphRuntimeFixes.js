import { pushDiagnosticLog } from '@/platform/rendererDiagnostics'
import { useSearchStore } from '../stores/searchStore'
import { useVaultStore } from '../stores/vaultStore'

let installed = false
let repairInFlight = false
let lastRepairVaultPath = ''
let repairTimer = null
let lastRepairCheckAt = 0

const MIN_REPAIR_CHECK_INTERVAL_MS = 30000

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

const scheduleRepairCheck = (repairGraphIfNeeded, delayMs = 0) => {
  if (repairTimer) window.clearTimeout(repairTimer)
  repairTimer = window.setTimeout(() => {
    repairTimer = null
    repairGraphIfNeeded().catch((error) => {
      pushDiagnosticLog('error', 'graph repair check failed', error)
    })
  }, delayMs)
}

export const installGraphRuntimeFixes = () => {
  if (installed) return
  installed = true
  pushDiagnosticLog('info', 'graph runtime repair guard installed')

  const repairGraphIfNeeded = async ({ force = false } = {}) => {
    const now = Date.now()
    if (!force && now - lastRepairCheckAt < MIN_REPAIR_CHECK_INTERVAL_MS) return
    lastRepairCheckAt = now

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

  const runRepair = (options) => repairGraphIfNeeded(options).catch((error) => {
    pushDiagnosticLog('error', 'graph repair event failed', error)
  })
  const forceRepair = () => runRepair({ force: true })
  const scheduleLazyRepair = () => scheduleRepairCheck(repairGraphIfNeeded, 250)

  window.addEventListener('elephantnote:repair-graph', forceRepair)
  window.addEventListener('focus', scheduleLazyRepair)
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleLazyRepair()
  })

  scheduleLazyRepair()
}

import { useSearchStore } from '../stores/searchStore'
import { useVaultStore } from '../stores/vaultStore'

let installed = false
let repairInFlight = false
let lastRepairVaultPath = ''

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

  const repairGraphIfNeeded = async () => {
    const vaultStore = useVaultStore()
    const searchStore = useSearchStore()
    const vaultPath = vaultStore.activeVault?.path || searchStore.vaultPath || ''

    if (!shouldRepairSparseGraph({
      vaultStore,
      searchStore,
      vaultPath,
      lastRepairPath: lastRepairVaultPath,
      inFlight: repairInFlight
    })) return

    repairInFlight = true
    lastRepairVaultPath = vaultPath
    try {
      await searchStore.rebuild()
      await searchStore.inspect()
    } catch (error) {
      console.warn('Unable to repair sparse graph index:', error)
    } finally {
      repairInFlight = false
    }
  }

  window.addEventListener('elephantnote:repair-graph', repairGraphIfNeeded)
  window.setInterval(() => {
    repairGraphIfNeeded().catch(() => {})
  }, 1500)
}

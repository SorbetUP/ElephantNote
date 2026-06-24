import { useSearchStore } from '../stores/searchStore'
import { useVaultStore } from '../stores/vaultStore'

let installed = false
let repairInFlight = false
let lastRepairVaultPath = ''

const hasSparseGraph = (searchStore) => {
  const graph = searchStore.indexInspection?.graph
  const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0
  return nodeCount <= 1
}

const hasSubstantialVault = (vaultStore) => {
  const entries = Array.isArray(vaultStore.rootEntries) ? vaultStore.rootEntries : []
  if (entries.length > 8) return true
  return entries.some((entry) => entry?.kind === 'folder' || entry?.type === 'folder')
}

export const installGraphRuntimeFixes = () => {
  if (installed) return
  installed = true

  const repairGraphIfNeeded = async () => {
    const vaultStore = useVaultStore()
    const searchStore = useSearchStore()
    const vaultPath = vaultStore.activeVault?.path || searchStore.vaultPath || ''

    if (vaultStore.activeWorkspaceView !== 'graph') return
    if (!vaultPath || repairInFlight) return
    if (!hasSparseGraph(searchStore) || !hasSubstantialVault(vaultStore)) return
    if (lastRepairVaultPath === vaultPath) return

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

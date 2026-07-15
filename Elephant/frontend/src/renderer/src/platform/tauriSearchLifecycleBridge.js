const normalizeVaultPath = (payload = '') => {
  if (typeof payload === 'string') return payload.trim()
  return String(payload?.vaultPath || payload?.path || '').trim()
}

const unavailable = (capability) => {
  throw new Error(`${capability} requires the optional Search addon.`)
}

export const installTauriSearchLifecycleBridge = (target = globalThis) => {
  const search = target?.elephantnote?.search
  if (!target?.__TAURI__ || !search) return false

  const readStatus = typeof search.status === 'function'
    ? search.status.bind(search)
    : async() => ({ enabled: true, runtime: 'tauri-rust' })
  let activeVaultPath = ''

  search.initVault = async(payload = '') => {
    activeVaultPath = normalizeVaultPath(payload) || activeVaultPath
    const status = await readStatus()
    return {
      ...status,
      status: status?.status || 'ready',
      vaultPath: status?.vaultPath || status?.activeVault?.path || activeVaultPath,
      indexedDocuments: Number(status?.indexedDocuments || 0),
      totalDocuments: Number(status?.totalDocuments || status?.indexedDocuments || 0)
    }
  }

  // Keep the method surface stable so the renderer never crashes with
  // "is not a function". Semantic inspection and index administration stay
  // physically owned by the optional Search addon.
  search.inspect = () => unavailable('Search inspection')
  search.rebuild = () => search.initVault(activeVaultPath)
  search.clear = () => unavailable('Clearing the semantic index')
  search.disable = () => unavailable('Disabling semantic search')
  search.enable = () => unavailable('Enabling semantic search')

  return true
}

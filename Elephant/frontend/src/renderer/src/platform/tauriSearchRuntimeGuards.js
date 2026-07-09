const resolveVaultPath = (value = '') => {
  if (typeof value === 'string') return value.trim()
  return String(value?.vaultPath || value?.path || '').trim()
}

const normalizeStatus = (status = {}, vaultPath = '') => {
  const indexedDocuments = Number(
    status.indexedDocuments ??
    status.notesIndexed ??
    status.indexedNotes ??
    status.documents ??
    0
  ) || 0
  return {
    ...status,
    vaultPath: status.vaultPath || status.activeVault?.path || resolveVaultPath(vaultPath) || '',
    indexedDocuments,
    totalDocuments: Number(status.totalDocuments ?? status.totalNotes ?? status.documents ?? indexedDocuments) || indexedDocuments,
    databasePath: status.databasePath || status.database_path || ''
  }
}

export const installTauriSearchRuntimeGuards = (target = globalThis) => {
  const search = target?.elephantnote?.search
  if (!target?.__TAURI__ || !search || target.__ELEPHANT_SEARCH_RUNTIME_GUARDS__) return false
  target.__ELEPHANT_SEARCH_RUNTIME_GUARDS__ = true

  let activeVaultPath = ''
  const rememberVaultPath = (value = '') => {
    const path = resolveVaultPath(value)
    if (path) activeVaultPath = path
    return activeVaultPath
  }

  const originalInitVault = search.initVault?.bind(search)
  if (typeof originalInitVault === 'function') {
    search.initVault = async(payload = '') => {
      rememberVaultPath(payload)
      console.info('[search] bridge:initVault:start', { vaultPath: activeVaultPath })
      const result = await originalInitVault(payload)
      const normalized = normalizeStatus(result, activeVaultPath)
      rememberVaultPath(normalized.vaultPath)
      console.info('[search] bridge:initVault:done', {
        vaultPath: normalized.vaultPath,
        indexedDocuments: normalized.indexedDocuments,
        status: normalized.status || ''
      })
      return normalized
    }
  }

  const originalStatus = search.status?.bind(search)
  if (typeof originalStatus === 'function') {
    search.status = async(payload = activeVaultPath) => {
      rememberVaultPath(payload)
      const result = await originalStatus(payload)
      const normalized = normalizeStatus(result, activeVaultPath)
      rememberVaultPath(normalized.vaultPath)
      console.info('[search] bridge:status:done', {
        vaultPath: normalized.vaultPath,
        indexedDocuments: normalized.indexedDocuments,
        status: normalized.status || '',
        semantic: normalized.semantic === true,
        realEmbedding: normalized.realEmbedding === true
      })
      return normalized
    }
  }

  const originalRebuild = search.rebuild?.bind(search)
  if (typeof originalRebuild === 'function') {
    search.rebuild = async(payload = activeVaultPath) => {
      rememberVaultPath(payload)
      console.info('[search] bridge:rebuild:start', { vaultPath: activeVaultPath })
      const result = await originalRebuild(payload)
      const normalized = normalizeStatus(result, activeVaultPath)
      rememberVaultPath(normalized.vaultPath)
      console.info('[search] bridge:rebuild:done', {
        vaultPath: normalized.vaultPath,
        indexedDocuments: normalized.indexedDocuments,
        provider: normalized.provider || '',
        semantic: normalized.semantic === true,
        realEmbedding: normalized.realEmbedding === true
      })
      return normalized
    }
  }

  console.info('[search] runtime-guards:installed')
  return true
}

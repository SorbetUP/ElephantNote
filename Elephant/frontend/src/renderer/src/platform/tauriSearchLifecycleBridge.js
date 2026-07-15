const normalizeVaultPath = (payload = '') => {
  if (typeof payload === 'string') return payload.trim()
  return String(payload?.vaultPath || payload?.path || '').trim()
}

const invoke = (target, command, payload = {}) => {
  const caller = target?.__TAURI__?.core?.invoke
  if (typeof caller !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return caller(command, payload)
}

export const installTauriSearchLifecycleBridge = (target = globalThis) => {
  const search = target?.elephantnote?.search
  if (!target?.__TAURI__ || !search) return false

  search.initVault = (payload = '') => invoke(target, 'tauri_search_init_vault', {
    vaultPath: normalizeVaultPath(payload) || null
  })
  search.inspect = () => invoke(target, 'tauri_search_inspect')
  search.rebuild = () => invoke(target, 'tauri_search_rebuild')
  search.clear = () => invoke(target, 'tauri_search_clear')
  search.disable = () => invoke(target, 'tauri_search_disable')
  search.enable = () => invoke(target, 'tauri_search_enable')

  return true
}

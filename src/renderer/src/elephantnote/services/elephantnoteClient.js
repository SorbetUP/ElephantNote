const requireElephantNoteApi = () => {
  if (!window.elephantnote?.api?.call) {
    throw new Error('ElephantNote API is not available in this renderer context.')
  }
  return window.elephantnote.api
}

export const isElephantNoteApiAvailable = () => !!window.elephantnote?.api?.call

const LEGACY_CALLS = {
  'vaults.get': () => window.elephantnote?.getVaults?.(),
  'vaults.select': () => window.elephantnote?.selectVault?.(),
  'vaults.setActive': ({ vaultId }) => window.elephantnote?.setActiveVault?.(vaultId),
  'directory.list': ({ relativePath = '' }) => window.elephantnote?.listDirectory?.(relativePath),
  'notes.create': ({ relativePath = '' }) => window.elephantnote?.createNote?.({ relativePath }),
  'folders.create': ({ relativePath = '' }) => window.elephantnote?.createFolder?.({ relativePath }),
  'sidebar.attach': (payload) => window.elephantnote?.attachSidebarEntry?.(payload),
  'sidebar.detach': ({ relativePath }) => window.elephantnote?.detachSidebarEntry?.({ relativePath }),
  'entries.rename': (payload) => window.elephantnote?.renameEntry?.(payload),
  'entries.delete': ({ relativePath }) => window.elephantnote?.deleteEntry?.({ relativePath }),
  'import.googleKeep': () => window.elephantnote?.importGoogleKeep?.(),
  'search.initVault': ({ vaultPath }) => window.elephantnote?.search?.initVault?.(vaultPath),
  'search.query': (payload) => window.elephantnote?.search?.query?.(payload),
  'search.status': () => window.elephantnote?.search?.status?.(),
  'search.inspect': () => window.elephantnote?.search?.inspect?.(),
  'search.rebuild': () => window.elephantnote?.search?.rebuild?.(),
  'search.clear': () => window.elephantnote?.search?.clear?.(),
  'search.disable': () => window.elephantnote?.search?.disable?.(),
  'search.enable': () => window.elephantnote?.search?.enable?.(),
  'sites.previewFolder': (payload) => window.elephantnote?.sitePreview?.previewFolder?.(payload),
  'sites.buildFolder': (payload) => window.elephantnote?.sitePreview?.buildFolder?.(payload),
  'sites.stop': ({ siteId }) => window.elephantnote?.sitePreview?.stop?.(siteId),
  'sites.status': ({ siteId }) => window.elephantnote?.sitePreview?.status?.(siteId),
  'sites.openExternal': ({ url }) => window.elephantnote?.sitePreview?.openExternal?.(url)
}

const unwrap = async(promise) => {
  const response = await promise
  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'ElephantNote API request failed.')
    error.code = response.error?.code || 'ELEPHANTNOTE_API_ERROR'
    throw error
  }
  return response?.data ?? response
}

export const elephantnoteClient = {
  describe: () => requireElephantNoteApi().describe(),
  call: (action, payload = {}) => {
    if (isElephantNoteApiAvailable()) {
      return unwrap(requireElephantNoteApi().call(action, payload))
    }
    const legacyCall = LEGACY_CALLS[action]
    if (!legacyCall) {
      throw new Error('ElephantNote API is not available in this renderer context.')
    }
    return legacyCall(payload)
  },
  vaults: {
    get: () => elephantnoteClient.call('vaults.get'),
    select: () => elephantnoteClient.call('vaults.select'),
    setActive: (vaultId) => elephantnoteClient.call('vaults.setActive', { vaultId })
  },
  directory: {
    list: (relativePath = '') => elephantnoteClient.call('directory.list', { relativePath })
  },
  notes: {
    create: (relativePath = '') => elephantnoteClient.call('notes.create', { relativePath })
  },
  folders: {
    create: (relativePath = '') => elephantnoteClient.call('folders.create', { relativePath })
  },
  sidebar: {
    attach: (payload) => elephantnoteClient.call('sidebar.attach', payload),
    detach: (relativePath) => elephantnoteClient.call('sidebar.detach', { relativePath })
  },
  entries: {
    rename: (payload) => elephantnoteClient.call('entries.rename', payload),
    delete: (relativePath) => elephantnoteClient.call('entries.delete', { relativePath })
  },
  imports: {
    googleKeep: () => elephantnoteClient.call('import.googleKeep')
  },
  search: {
    initVault: (vaultPath) => elephantnoteClient.call('search.initVault', { vaultPath }),
    query: (params) => elephantnoteClient.call('search.query', params),
    status: () => elephantnoteClient.call('search.status'),
    inspect: () => elephantnoteClient.call('search.inspect'),
    rebuild: () => elephantnoteClient.call('search.rebuild'),
    clear: () => elephantnoteClient.call('search.clear'),
    disable: () => elephantnoteClient.call('search.disable'),
    enable: () => elephantnoteClient.call('search.enable')
  },
  sitePreview: {
    previewFolder: (params) => elephantnoteClient.call('sites.previewFolder', params),
    buildFolder: (params) => elephantnoteClient.call('sites.buildFolder', params),
    stop: (siteId) => elephantnoteClient.call('sites.stop', { siteId }),
    status: (siteId) => elephantnoteClient.call('sites.status', { siteId }),
    openExternal: (url) => elephantnoteClient.call('sites.openExternal', { url })
  },
  features: {
    get: () => elephantnoteClient.call('features.get'),
    set: (key, enabled) => elephantnoteClient.call('features.set', { key, enabled })
  },
  sync: {
    status: () => elephantnoteClient.call('sync.status'),
    enqueue: (operation, payload = {}) => elephantnoteClient.call('sync.enqueue', { operation, payload }),
    run: () => elephantnoteClient.call('sync.run')
  }
}

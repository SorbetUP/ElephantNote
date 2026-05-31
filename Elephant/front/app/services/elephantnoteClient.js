const requireElephantNoteApi = () => {
  if (!window.elephantnote?.api?.call) {
    throw new Error('ElephantNote API is not available in this renderer context.')
  }
  return window.elephantnote.api
}

const requireAtomicFeatureApi = () => {
  if (window.elephantnote?.atomicFeatures) {
    return window.elephantnote.atomicFeatures
  }

  const ipcRenderer = window.electron?.ipcRenderer
  if (!ipcRenderer?.invoke) {
    throw new Error('Atomic feature IPC is not available in this renderer context.')
  }

  return {
    providers: () => ipcRenderer.invoke('en:atomic:providers'),
    overview: (payload = {}) => ipcRenderer.invoke('en:atomic:overview', payload),
    graph: (payload = {}) => ipcRenderer.invoke('en:atomic:graph', payload),
    wiki: (payload = {}) => ipcRenderer.invoke('en:atomic:wiki', payload),
    createWikiPage: (payload = {}) => ipcRenderer.invoke('en:atomic:wiki:create-page', payload),
    summarize: (payload = {}) => ipcRenderer.invoke('en:atomic:summarize', payload),
    structure: (payload = {}) => ipcRenderer.invoke('en:atomic:structure', payload),
    listLocalModels: () => ipcRenderer.invoke('en:atomic:models:list-local'),
    pullModel: (payload = {}) => ipcRenderer.invoke('en:atomic:models:pull', payload)
  }
}

export const isElephantNoteApiAvailable = () => !!window.elephantnote?.api?.call

const LEGACY_CALLS = {
  'vaults.get': () => window.elephantnote?.getVaults?.(),
  'vaults.select': () => window.elephantnote?.selectVault?.(),
  'vaults.setActive': ({ vaultId }) => window.elephantnote?.setActiveVault?.(vaultId),
  'vaults.setIcon': (payload) => window.elephantnote?.setVaultIcon?.(payload),
  'vaults.setName': (payload) => window.elephantnote?.setVaultName?.(payload),
  'vaults.remove': (payload) => window.elephantnote?.removeVault?.(payload),
  'directory.list': ({ relativePath = '' }) => window.elephantnote?.listDirectory?.(relativePath),
  'notes.create': ({ relativePath = '' }) => window.elephantnote?.createNote?.({ relativePath }),
  'folders.create': ({ relativePath = '' }) => window.elephantnote?.createFolder?.({ relativePath }),
  'sidebar.attach': (payload) => window.elephantnote?.attachSidebarEntry?.(payload),
  'sidebar.detach': ({ relativePath }) => window.elephantnote?.detachSidebarEntry?.({ relativePath }),
  'entries.rename': (payload) => window.elephantnote?.renameEntry?.(payload),
  'entries.move': (payload) => window.elephantnote?.moveEntry?.(payload),
  'entries.delete': ({ relativePath }) => window.elephantnote?.deleteEntry?.({ relativePath }),
  'import.googleKeep': () => window.elephantnote?.importGoogleKeep?.(),
  'calendar.list': () => window.elephantnote?.calendar?.list?.(),
  'calendar.importGoogle': () => window.elephantnote?.calendar?.importGoogle?.(),
  'calendar.importGoogleFromPath': (payload) => window.elephantnote?.calendar?.importGoogleFromPath?.(payload),
  'calendar.google.config.get': () => window.elephantnote?.calendar?.googleConfigGet?.(),
  'calendar.google.config.set': (payload) => window.elephantnote?.calendar?.googleConfigSet?.(payload),
  'calendar.google.sync': () => window.elephantnote?.calendar?.googleSync?.(),
  'sources.list': () => window.elephantnote?.sources?.list?.(),
  'sources.ingestUrl': (payload) => window.elephantnote?.sources?.ingestUrl?.(payload),
  'sources.importRss': (payload) => window.elephantnote?.sources?.importRss?.(payload),
  'wiki.list': () => window.elephantnote?.wiki?.list?.(),
  'wiki.propose': () => window.elephantnote?.wiki?.propose?.(),
  'wiki.accept': (payload) => window.elephantnote?.wiki?.accept?.(payload),
  'wiki.dismiss': (payload) => window.elephantnote?.wiki?.dismiss?.(payload),
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
  'sites.openExternal': ({ url }) => window.elephantnote?.sitePreview?.openExternal?.(url),
  'atomic.catalog.get': () => window.elephantnote?.atomic?.getCatalog?.(),
  'models.selection.get': () => window.elephantnote?.models?.getSelection?.(),
  'models.selection.set': (payload) => window.elephantnote?.models?.setSelection?.(payload),
  'plugins.list': () => window.elephantnote?.plugins?.list?.(),
  'plugins.set': (payload) => window.elephantnote?.plugins?.set?.(payload),
  'plugins.run': (payload) => window.elephantnote?.plugins?.run?.(payload),
  'tasks.list': () => window.elephantnote?.tasks?.list?.(),
  'tasks.set': (payload) => window.elephantnote?.tasks?.set?.(payload),
  'tasks.run': (payload) => window.elephantnote?.tasks?.run?.(payload),
  'agents.list': () => window.elephantnote?.agents?.list?.(),
  'agents.register': (payload) => window.elephantnote?.agents?.register?.(payload),
  'agents.unregister': ({ id }) => window.elephantnote?.agents?.unregister?.(id),
  'agents.send': (payload) => window.elephantnote?.agents?.send?.(payload),
  'rag.chat': (payload) => window.elephantnote?.rag?.chat?.(payload),
  'notes.autotag': (payload) => window.elephantnote?.notes?.autotag?.(payload),
  'mcp.tools.list': () => window.elephantnote?.mcp?.listTools?.(),
  'mcp.tools.call': (payload) => window.elephantnote?.mcp?.callTool?.(payload),
  'models.local.list': () => window.elephantnote?.models?.listLocal?.(),
  'models.download': (payload) => window.elephantnote?.models?.download?.(payload),
  'programs.list': () => window.elephantnote?.programs?.list?.(),
  'programs.set': (payload) => window.elephantnote?.programs?.set?.(payload),
  'programs.run': (payload) => window.elephantnote?.programs?.run?.(payload)
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
    setActive: (vaultId) => elephantnoteClient.call('vaults.setActive', { vaultId }),
    setIcon: (vaultId, icon) => elephantnoteClient.call('vaults.setIcon', { vaultId, icon }),
    setName: (vaultId, name) => elephantnoteClient.call('vaults.setName', { vaultId, name }),
    remove: (vaultId) => elephantnoteClient.call('vaults.remove', { vaultId })
  },
  directory: {
    list: (relativePath = '') => elephantnoteClient.call('directory.list', { relativePath })
  },
  notes: {
    create: (relativePath = '') => elephantnoteClient.call('notes.create', { relativePath }),
    autotag: (relativePath) => elephantnoteClient.call('notes.autotag', { relativePath })
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
    move: (payload) => elephantnoteClient.call('entries.move', payload),
    delete: (relativePath) => elephantnoteClient.call('entries.delete', { relativePath })
  },
  imports: {
    googleKeep: () => elephantnoteClient.call('import.googleKeep')
  },
  calendar: {
    list: () => elephantnoteClient.call('calendar.list'),
    importGoogle: () => elephantnoteClient.call('calendar.importGoogle'),
    importGoogleFromPath: (sourcePath) => elephantnoteClient.call('calendar.importGoogleFromPath', { sourcePath }),
    getGoogleConfig: () => elephantnoteClient.call('calendar.google.config.get'),
    setGoogleConfig: (config) => elephantnoteClient.call('calendar.google.config.set', config),
    syncGoogle: () => elephantnoteClient.call('calendar.google.sync')
  },
  sources: {
    list: () => elephantnoteClient.call('sources.list'),
    ingestUrl: (url, destinationRelativePath = 'Sources') =>
      elephantnoteClient.call('sources.ingestUrl', { url, destinationRelativePath }),
    importRss: (url, destinationRelativePath = 'Sources', limit = 20) =>
      elephantnoteClient.call('sources.importRss', { url, destinationRelativePath, limit })
  },
  wiki: {
    list: () => elephantnoteClient.call('wiki.list'),
    propose: () => elephantnoteClient.call('wiki.propose'),
    accept: (id) => elephantnoteClient.call('wiki.accept', { id }),
    dismiss: (id) => elephantnoteClient.call('wiki.dismiss', { id })
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
  ai: {
    getConfig: () => elephantnoteClient.call('ai.config.get'),
    setConfig: (config) => elephantnoteClient.call('ai.config.set', config)
  },
  atomic: {
    getCatalog: () => elephantnoteClient.call('atomic.catalog.get')
  },
  atomicFeatures: {
    providers: () => requireAtomicFeatureApi().providers(),
    overview: (vaultRoot, options = {}) => requireAtomicFeatureApi().overview({ vaultRoot, ...options }),
    graph: (vaultRoot, options = {}) => requireAtomicFeatureApi().graph({ vaultRoot, ...options }),
    wiki: (vaultRoot, options = {}) => requireAtomicFeatureApi().wiki({ vaultRoot, ...options }),
    createWikiPage: (vaultRoot, record) => requireAtomicFeatureApi().createWikiPage({ vaultRoot, record }),
    summarize: (vaultRoot, relativePath, providerConfig = {}) =>
      requireAtomicFeatureApi().summarize({ vaultRoot, relativePath, providerConfig }),
    structure: (vaultRoot, relativePath, providerConfig = {}) =>
      requireAtomicFeatureApi().structure({ vaultRoot, relativePath, providerConfig }),
    listLocalModels: () => requireAtomicFeatureApi().listLocalModels(),
    pullModel: (id, provider = 'ollama') => requireAtomicFeatureApi().pullModel({ id, provider })
  },
  models: {
    getSelection: () => elephantnoteClient.call('models.selection.get'),
    setSelection: (selection) => elephantnoteClient.call('models.selection.set', selection),
    listLocal: () => elephantnoteClient.call('models.local.list'),
    download: (id) => elephantnoteClient.call('models.download', { id })
  },
  plugins: {
    list: () => elephantnoteClient.call('plugins.list'),
    set: (payload) => elephantnoteClient.call('plugins.set', payload),
    run: (id, input = {}) => elephantnoteClient.call('plugins.run', { id, input })
  },
  tasks: {
    list: () => elephantnoteClient.call('tasks.list'),
    set: (payload) => elephantnoteClient.call('tasks.set', payload),
    run: (id) => elephantnoteClient.call('tasks.run', { id })
  },
  agents: {
    list: () => elephantnoteClient.call('agents.list'),
    register: (payload) => elephantnoteClient.call('agents.register', payload),
    unregister: (id) => elephantnoteClient.call('agents.unregister', { id }),
    send: (id, message) => elephantnoteClient.call('agents.send', { id, message })
  },
  rag: {
    chat: (message, limit = 6) => elephantnoteClient.call('rag.chat', { message, limit })
  },
  mcp: {
    listTools: () => elephantnoteClient.call('mcp.tools.list'),
    callTool: (name, args = {}) => elephantnoteClient.call('mcp.tools.call', { name, arguments: args })
  },
  programs: {
    list: () => elephantnoteClient.call('programs.list'),
    set: (environments) => elephantnoteClient.call('programs.set', { environments }),
    run: (id, command, cwd = '') => elephantnoteClient.call('programs.run', { id, command, cwd })
  },
  sync: {
    status: () => elephantnoteClient.call('sync.status'),
    enqueue: (operation, payload = {}) => elephantnoteClient.call('sync.enqueue', { operation, payload }),
    run: () => elephantnoteClient.call('sync.run')
  }
}

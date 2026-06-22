const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (target, command, payload = {}) => {
  const core = getCore(target)
  if (!core?.invoke) {
    throw new Error(`Tauri command API is unavailable for ${command}`)
  }
  return core.invoke(command, payload)
}

const openVaultDirectory = async() => {
  const dialog = await import('@tauri-apps/plugin-dialog')
  return dialog.open({ multiple: false, directory: true, createDirectory: true })
}

const normalizePayload = (payload = {}) => (payload && typeof payload === 'object' ? payload : {})
const asRelativePathPayload = (payload = {}) => {
  if (typeof payload === 'string') return { relativePath: payload }
  return normalizePayload(payload)
}

const createDesktopOnlyResult = (feature) => ({
  ok: false,
  runtime: 'tauri',
  reason: `${feature} is not implemented in the Rust Tauri backend yet.`
})

const createBridge = (target) => ({
  api: {
    describe: async() => ({
      runtime: 'tauri',
      backend: 'rust',
      bridge: 'elephantnote-tauri',
      actions: [
        'vaults.get',
        'vaults.select',
        'vaults.setActive',
        'vaults.setIcon',
        'vaults.setName',
        'vaults.remove',
        'directory.list',
        'notes.create',
        'notes.read',
        'notes.write',
        'folders.create',
        'sidebar.attach',
        'sidebar.detach',
        'entries.rename',
        'entries.move',
        'entries.delete',
        'attachments.list',
        'attachments.writeText',
        'drawings.list',
        'drawings.create',
        'drawings.read',
        'drawings.write',
        'calendar.list',
        'sources.list',
        'wiki.list',
        'search.query',
        'search.rebuild',
        'sync.status',
        'sync.plan',
        'sync.enqueue',
        'sync.run',
        'models.getSelection',
        'models.setSelection'
      ]
    })
  },

  getVaults: () => invoke(target, 'tauri_vaults_get'),
  selectVault: async() => {
    const folder = await openVaultDirectory()
    const vaultPath = Array.isArray(folder) ? folder[0] : folder
    if (!vaultPath) return invoke(target, 'tauri_vaults_get')
    return invoke(target, 'tauri_vaults_select_path', { vaultPath })
  },
  setActiveVault: (vaultId) => invoke(target, 'tauri_vaults_set_active', { vaultId }),
  setVaultIcon: (payload = {}) => invoke(target, 'tauri_vaults_set_icon', normalizePayload(payload)),
  setVaultName: (payload = {}) => invoke(target, 'tauri_vaults_set_name', normalizePayload(payload)),
  removeVault: (payload = {}) => invoke(target, 'tauri_vaults_remove', normalizePayload(payload)),

  listDirectory: (relativePath = '') => invoke(target, 'tauri_directory_list', { relativePath }),
  createNote: (payload = {}) => invoke(target, 'tauri_notes_create', asRelativePathPayload(payload)),
  readNote: (payload = {}) => invoke(target, 'tauri_notes_read', asRelativePathPayload(payload)),
  writeNote: (payload = {}) => invoke(target, 'tauri_notes_write', normalizePayload(payload)),
  createFolder: (payload = {}) => invoke(target, 'tauri_folders_create', asRelativePathPayload(payload)),
  attachSidebarEntry: (payload = {}) => invoke(target, 'tauri_sidebar_attach', {
    relativePath: payload.relativePath || payload.path || '',
    title: payload.title || '',
    entryType: payload.type || payload.entryType || ''
  }),
  detachSidebarEntry: (payload = {}) => invoke(target, 'tauri_sidebar_detach', normalizePayload(payload)),
  renameEntry: (payload = {}) => invoke(target, 'tauri_entries_rename', normalizePayload(payload)),
  moveEntry: (payload = {}) => invoke(target, 'tauri_entries_move', normalizePayload(payload)),
  deleteEntry: (payload = {}) => invoke(target, 'tauri_entries_delete', normalizePayload(payload)),

  importGoogleKeep: async() => createDesktopOnlyResult('Google Keep import'),

  notes: {
    read: (payload = {}) => invoke(target, 'tauri_notes_read', asRelativePathPayload(payload)),
    write: (payload = {}) => invoke(target, 'tauri_notes_write', normalizePayload(payload)),
    autotag: async() => ({ tags: [] })
  },

  attachments: {
    list: () => invoke(target, 'tauri_attachments_list'),
    writeText: (payload = {}) => invoke(target, 'tauri_attachments_write_text', normalizePayload(payload))
  },

  drawings: {
    list: () => invoke(target, 'tauri_drawings_list'),
    create: (payload = {}) => invoke(target, 'tauri_drawings_create', normalizePayload(payload)),
    read: (payload = {}) => invoke(target, 'tauri_drawings_read', asRelativePathPayload(payload)),
    write: (payload = {}) => invoke(target, 'tauri_drawings_write', normalizePayload(payload))
  },

  calendar: {
    list: () => invoke(target, 'tauri_calendar_list'),
    importGoogle: async() => createDesktopOnlyResult('Google Calendar import'),
    importGoogleFromPath: async() => createDesktopOnlyResult('Google Calendar import from path'),
    googleConfigGet: async() => ({}),
    googleConfigSet: async(config) => config,
    googleSync: async() => createDesktopOnlyResult('Google Calendar sync')
  },

  sources: {
    list: () => invoke(target, 'tauri_sources_list'),
    ingestUrl: async() => createDesktopOnlyResult('source URL ingestion'),
    importRss: async() => createDesktopOnlyResult('RSS import')
  },

  wiki: {
    list: () => invoke(target, 'tauri_wiki_list'),
    propose: async() => [],
    accept: async() => null,
    dismiss: async() => null,
    sourceInfo: async() => null,
    context: async() => ({ records: [], notes: [] })
  },

  search: {
    initVault: (vaultPath = '') => Promise.resolve({ ok: true, runtime: 'tauri-rust', vaultPath }),
    query: (params = {}) => invoke(target, 'tauri_search_query', { params }),
    status: () => invoke(target, 'tauri_search_status'),
    rebuild: () => invoke(target, 'tauri_search_rebuild'),
    inspect: async() => ({}),
    clear: async() => ({ ok: true, runtime: 'tauri-rust' }),
    disable: async() => ({ ok: true, runtime: 'tauri-rust' }),
    enable: async() => ({ ok: true, runtime: 'tauri-rust' })
  },

  sync: {
    status: () => invoke(target, 'tauri_sync_status'),
    plan: () => invoke(target, 'tauri_sync_plan'),
    enqueue: (operation, payload = {}) => invoke(target, 'tauri_sync_enqueue', { operation, payload }),
    run: (payloadByOperation = {}) => invoke(target, 'tauri_sync_run', { payloadByOperation })
  },

  models: {
    list: async() => [],
    listLocal: async() => [],
    getSelection: () => invoke(target, 'tauri_models_get_selection'),
    setSelection: (selection) => invoke(target, 'tauri_models_set_selection', { selection }),
    active: () => invoke(target, 'tauri_models_get_selection'),
    searchHuggingFace: async() => [],
    info: async() => null,
    download: async() => createDesktopOnlyResult('model download'),
    cancelDownload: async() => ({ ok: true }),
    downloadStatus: async() => null,
    activate: async() => null,
    deactivate: async() => null,
    remove: async() => null,
    refreshIndex: async() => ({ ok: true }),
    onDownloadProgress: () => () => {}
  },

  sitePreview: {
    previewFolder: async() => createDesktopOnlyResult('site preview'),
    buildFolder: async() => createDesktopOnlyResult('site build'),
    stop: async() => ({ ok: true }),
    status: async() => null,
    openExternal: async(url) => target.electron?.shell?.openExternal?.(url)
  },

  atomicFeatures: {
    describeApi: async() => ({ runtime: 'tauri-rust', actions: [] }),
    callApi: async() => null,
    providers: async() => [],
    overview: async() => null,
    graph: async() => null,
    wiki: async() => null,
    createWikiPage: async() => null,
    summarize: async() => null,
    structure: async() => null,
    autoNameNote: async() => null,
    listLocalModels: async() => [],
    pullModel: async() => createDesktopOnlyResult('model pull'),
    onModelPullProgress: () => () => {}
  },

  agents: { list: async() => [], register: async() => null, unregister: async() => null, send: async() => null },
  atomic: { getCatalog: async() => [] },
  plugins: { list: async() => [], set: async(payload) => payload, run: async() => null },
  tasks: { list: async() => [], set: async(payload) => payload, run: async() => null },
  rag: { chat: async() => ({ answer: '', sources: [] }) },
  mcp: { listTools: async() => [], callTool: async() => null },
  programs: { list: async() => [], set: async(payload) => payload, run: async() => null }
})

export const installTauriElephantNoteBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target?.elephantnote?.getVaults) return false
  target.elephantnote = {
    ...(target.elephantnote || {}),
    ...createBridge(target)
  }
  return true
}

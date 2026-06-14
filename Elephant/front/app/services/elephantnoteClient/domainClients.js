import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

export const createDomainClients = (call, requireAtomicFeatureApi) => ({
  vaults: {
    get: () => call(API.VAULTS_GET),
    select: () => call(API.VAULTS_SELECT),
    setActive: (vaultId) => call(API.VAULTS_SET_ACTIVE, { vaultId }),
    setIcon: (vaultId, icon) => call(API.VAULTS_SET_ICON, { vaultId, icon }),
    setName: (vaultId, name) => call(API.VAULTS_SET_NAME, { vaultId, name }),
    remove: (vaultId) => call(API.VAULTS_REMOVE, { vaultId })
  },
  directory: {
    list: (relativePath = '') => call(API.DIRECTORY_LIST, { relativePath })
  },
  notes: {
    create: (relativePath = '') => call(API.NOTES_CREATE, { relativePath }),
    autotag: (relativePath) => call(API.NOTES_AUTOTAG, { relativePath })
  },
  folders: {
    create: (relativePath = '') => call(API.FOLDERS_CREATE, { relativePath })
  },
  sidebar: {
    attach: (payload) => call(API.SIDEBAR_ATTACH, payload),
    detach: (relativePath) => call(API.SIDEBAR_DETACH, { relativePath })
  },
  entries: {
    rename: (payload) => call(API.ENTRIES_RENAME, payload),
    move: (payload) => call(API.ENTRIES_MOVE, payload),
    delete: (relativePath) => call(API.ENTRIES_DELETE, { relativePath })
  },
  imports: {
    googleKeep: () => call(API.IMPORT_GOOGLE_KEEP)
  },
  calendar: {
    list: () => call(API.CALENDAR_LIST),
    importGoogle: () => call(API.CALENDAR_IMPORT_GOOGLE),
    importGoogleFromPath: (sourcePath) => call(API.CALENDAR_IMPORT_GOOGLE_FROM_PATH, { sourcePath }),
    getGoogleConfig: () => call(API.CALENDAR_GOOGLE_CONFIG_GET),
    setGoogleConfig: (config) => call(API.CALENDAR_GOOGLE_CONFIG_SET, config),
    syncGoogle: () => call(API.CALENDAR_GOOGLE_SYNC)
  },
  sources: {
    list: () => call(API.SOURCES_LIST),
    ingestUrl: (url, destinationRelativePath = 'Sources') => call(API.SOURCES_INGEST_URL, { url, destinationRelativePath }),
    importRss: (url, destinationRelativePath = 'Sources', limit = 20) => call(API.SOURCES_IMPORT_RSS, { url, destinationRelativePath, limit })
  },
  wiki: {
    list: () => call(API.WIKI_LIST),
    propose: () => call(API.WIKI_PROPOSE),
    accept: (id) => call(API.WIKI_ACCEPT, { id }),
    dismiss: (id) => call(API.WIKI_DISMISS, { id })
  },
  search: {
    initVault: (vaultPath) => call(API.SEARCH_INIT_VAULT, { vaultPath }),
    query: (params) => call(API.SEARCH_QUERY, params),
    status: () => call(API.SEARCH_STATUS),
    inspect: () => call(API.SEARCH_INSPECT),
    rebuild: () => call(API.SEARCH_REBUILD),
    clear: () => call(API.SEARCH_CLEAR),
    disable: () => call(API.SEARCH_DISABLE),
    enable: () => call(API.SEARCH_ENABLE)
  },
  sitePreview: {
    previewFolder: (params) => call(API.SITES_PREVIEW_FOLDER, params),
    buildFolder: (params) => call(API.SITES_BUILD_FOLDER, params),
    stop: (siteId) => call(API.SITES_STOP, { siteId }),
    status: (siteId) => call(API.SITES_STATUS, { siteId }),
    openExternal: (url) => call(API.SITES_OPEN_EXTERNAL, { url })
  },
  features: {
    get: () => call(API.FEATURES_GET),
    set: (key, enabled) => call(API.FEATURES_SET, { key, enabled })
  },
  ai: {
    getConfig: () => call(API.AI_CONFIG_GET),
    setConfig: (config) => call(API.AI_CONFIG_SET, config),
    testConfig: (config = {}) => call(API.AI_CONFIG_TEST, config)
  },
  atomic: {
    getCatalog: () => call(API.ATOMIC_CATALOG_GET)
  },
  atomicFeatures: {
    describeApi: () => requireAtomicFeatureApi().describeApi(),
    callApi: (action, args = {}) => requireAtomicFeatureApi().callApi({ action, arguments: args }),
    providers: () => requireAtomicFeatureApi().providers(),
    overview: (vaultRoot, options = {}) => requireAtomicFeatureApi().overview({ vaultRoot, ...options }),
    graph: (vaultRoot, options = {}) => requireAtomicFeatureApi().graph({ vaultRoot, ...options }),
    wiki: (vaultRoot, options = {}) => requireAtomicFeatureApi().wiki({ vaultRoot, ...options }),
    createWikiPage: (vaultRoot, record) => requireAtomicFeatureApi().createWikiPage({ vaultRoot, record }),
    summarize: (vaultRoot, relativePath, providerConfig = {}) => requireAtomicFeatureApi().summarize({ vaultRoot, relativePath, providerConfig }),
    structure: (vaultRoot, relativePath, providerConfig = {}) => requireAtomicFeatureApi().structure({ vaultRoot, relativePath, providerConfig }),
    autoNameNote: (vaultRoot, relativePath, options = {}) => requireAtomicFeatureApi().autoNameNote({ vaultRoot, relativePath, ...options }),
    listLocalModels: (vaultRoot = '') => requireAtomicFeatureApi().listLocalModels({ vaultRoot }),
    pullModel: (id, provider = 'ollama', vaultRoot = '') => requireAtomicFeatureApi().pullModel({ id, provider, vaultRoot }),
    onModelPullProgress: (listener) => requireAtomicFeatureApi().onModelPullProgress?.(listener) || (() => {})
  },
  models: {
    getSelection: () => call(API.MODEL_SELECTION_GET),
    setSelection: (selection) => call(API.MODEL_SELECTION_SET, selection),
    listLocal: () => call(API.MODELS_LOCAL_LIST),
    download: (id) => call(API.MODELS_DOWNLOAD, { id })
  },
  ocr: {
    extract: (imagePath, options = {}) => call(API.OCR_EXTRACT, { imagePath, ...options })
  },
  plugins: {
    list: () => call(API.PLUGINS_LIST),
    set: (payload) => call(API.PLUGINS_SET, payload),
    run: (id, input = {}) => call(API.PLUGINS_RUN, { id, input })
  },
  tasks: {
    list: () => call(API.TASKS_LIST),
    set: (payload) => call(API.TASKS_SET, payload),
    run: (id) => call(API.TASKS_RUN, { id })
  },
  agents: {
    list: () => call(API.AGENTS_LIST),
    register: (payload) => call(API.AGENTS_REGISTER, payload),
    unregister: (id) => call(API.AGENTS_UNREGISTER, { id }),
    send: (id, message) => call(API.AGENTS_SEND, { id, message })
  },
  rag: {
    chat: (message, limit = 6) => call(API.RAG_CHAT, { message, limit })
  },
  mcp: {
    listTools: () => call(API.MCP_TOOLS_LIST),
    callTool: (name, args = {}) => call(API.MCP_TOOLS_CALL, { name, arguments: args })
  },
  programs: {
    list: () => call(API.PROGRAMS_LIST),
    set: (environments) => call(API.PROGRAMS_SET, { environments }),
    run: (id, command, cwd = '') => call(API.PROGRAMS_RUN, { id, command, cwd })
  },
  sync: {
    status: () => call(API.SYNC_STATUS),
    enqueue: (operation, payload = {}) => call(API.SYNC_ENQUEUE, { operation, payload }),
    run: (payloadByOperation = {}) => call(API.SYNC_RUN, payloadByOperation)
  }
})

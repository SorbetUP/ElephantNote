import { toPlainObject } from '../../../../shared/plainObject.js'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS
} from 'common/elephantnote/apiContractsV2'

const CHAT_REBUILD_COOLDOWN_MS = 60_000
const searchVaultInitializedForChat = new Map()
const chatSearchRebuiltAt = new Map()

const shouldRebuildChatSearch = (vaultPath, now = Date.now()) => {
  if (!vaultPath) return false
  const lastRebuildAt = chatSearchRebuiltAt.get(vaultPath) || 0
  if (now - lastRebuildAt < CHAT_REBUILD_COOLDOWN_MS) return false
  chatSearchRebuiltAt.set(vaultPath, now)
  return true
}

const ensureSearchVaultForChat = async(call) => {
  const vaultPayload = await call(API.VAULTS_GET).catch(() => null)
  const vaultPath = String(vaultPayload?.activeVault?.path || '').trim()
  if (!vaultPath) return ''
  if (!searchVaultInitializedForChat.has(vaultPath)) {
    await call(API.SEARCH_INIT_VAULT, { vaultPath }).catch(() => null)
    searchVaultInitializedForChat.set(vaultPath, true)
  }
  return vaultPath
}

const hasCitations = (result) => Array.isArray(result?.citations) && result.citations.length > 0
const hasAnswer = (result) => typeof result?.answer === 'string' && result.answer.trim().length > 0

const normalizeRagChatPayload = (payload, limit = 6) => {
  if (payload && typeof payload === 'object') {
    return {
      message: String(payload.message || '').trim(),
      limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : limit,
      messages: Array.isArray(payload.messages) ? payload.messages : []
    }
  }
  return { message: String(payload || '').trim(), limit, messages: [] }
}

const callRagChat = async(call, payload, limit = 6) => {
  const vaultPath = await ensureSearchVaultForChat(call)
  const request = normalizeRagChatPayload(payload, limit)
  const result = await call(API.RAG_CHAT, request)
  if (hasAnswer(result) || hasCitations(result) || !shouldRebuildChatSearch(vaultPath)) return result
  await call(API.SEARCH_REBUILD, {}).catch(() => null)
  const retry = await call(API.RAG_CHAT, request).catch(() => null)
  return hasAnswer(retry) || hasCitations(retry) ? retry : result
}

const directoryListPayload = (payload = '') =>
  typeof payload === 'string' ? { relativePath: payload } : toPlainObject(payload)
const normalizeModelPayload = (payload = {}) =>
  typeof payload === 'string' ? { id: payload } : toPlainObject(payload)
const normalizeAtomicPayload = (vaultRoot = '', extra = {}) => ({ vaultRoot, ...toPlainObject(extra) })

export const createDomainClients = (call, subscribe = () => () => {}) => {
  const calendarImport = (provider = 'google', options = {}) =>
    call(API.CALENDAR_IMPORT, { provider, ...toPlainObject(options) })
  const calendarGetConfig = (provider = 'google') =>
    call(API.CALENDAR_PROVIDER_CONFIG_GET, { provider })
  const calendarSetConfig = (provider = 'google', config = {}) =>
    call(API.CALENDAR_PROVIDER_CONFIG_SET, { provider, config: toPlainObject(config) })
  const calendarSync = (provider = 'google', options = {}) =>
    call(API.CALENDAR_SYNC, { provider, options: toPlainObject(options) })
  const modelsSearch = (payload = {}) =>
    call(API.MODELS_SEARCH, { provider: 'huggingface', ...normalizeModelPayload(payload) })

  return {
    vaults: {
      get: () => call(API.VAULTS_GET), select: () => call(API.VAULTS_SELECT),
      setActive: (vaultId) => call(API.VAULTS_SET_ACTIVE, { vaultId }),
      setIcon: (vaultId, icon) => call(API.VAULTS_SET_ICON, { vaultId, icon }),
      setName: (vaultId, name) => call(API.VAULTS_SET_NAME, { vaultId, name }),
      remove: (vaultId) => call(API.VAULTS_REMOVE, { vaultId })
    },
    directory: { list: (payload = '') => call(API.DIRECTORY_LIST, directoryListPayload(payload)) },
    notes: {
      create: (payload = '') => typeof payload === 'string'
        ? call(API.NOTES_CREATE, { relativePath: payload }) : call(API.NOTES_CREATE, payload),
      read: (relativePath) => call(API.NOTES_READ, typeof relativePath === 'string' ? { relativePath } : relativePath),
      write: (payload = {}) => call(API.NOTES_WRITE, payload),
      autotag: (relativePath) => call(API.NOTES_AUTOTAG, { relativePath })
    },
    folders: { create: (relativePath = '') => call(API.FOLDERS_CREATE, { relativePath }) },
    sidebar: {
      attach: (payload) => call(API.SIDEBAR_ATTACH, payload),
      detach: (relativePath) => call(API.SIDEBAR_DETACH, { relativePath })
    },
    entries: {
      rename: (payload) => call(API.ENTRIES_RENAME, payload), move: (payload) => call(API.ENTRIES_MOVE, payload),
      delete: (relativePath) => call(API.ENTRIES_DELETE, { relativePath })
    },
    imports: { googleKeep: () => call(API.IMPORT_GOOGLE_KEEP) },
    calendar: {
      list: () => call(API.CALENDAR_LIST), providers: () => call(API.CALENDAR_PROVIDERS_LIST),
      import: calendarImport, getProviderConfig: calendarGetConfig, setProviderConfig: calendarSetConfig, sync: calendarSync,
      importGoogle: () => calendarImport('google'),
      importGoogleFromPath: (sourcePath) => calendarImport('google', { sourcePath }),
      getGoogleConfig: () => calendarGetConfig('google'), setGoogleConfig: (config) => calendarSetConfig('google', config),
      syncGoogle: () => calendarSync('google')
    },
    sources: {
      list: () => call(API.SOURCES_LIST),
      ingestUrl: (url, destinationRelativePath = 'Sources') => call(API.SOURCES_INGEST_URL, { url, destinationRelativePath }),
      importRss: (url, destinationRelativePath = 'Sources', limit = 20) => call(API.SOURCES_IMPORT_RSS, { url, destinationRelativePath, limit })
    },
    wiki: {
      list: () => call(API.WIKI_LIST), propose: () => call(API.WIKI_PROPOSE),
      accept: (id) => call(API.WIKI_ACCEPT, { id }), dismiss: (id) => call(API.WIKI_DISMISS, { id }),
      sourceInfo: (path) => call(API.WIKI_SOURCE_INFO, { path }), context: (path, limit = 12) => call(API.WIKI_CONTEXT, { path, limit })
    },
    search: {
      initVault: (vaultPath) => call(API.SEARCH_INIT_VAULT, { vaultPath }), query: (params) => call(API.SEARCH_QUERY, params),
      concepts: (params) => call(API.SEARCH_CONCEPTS, params), status: () => call(API.SEARCH_STATUS),
      inspect: () => call(API.SEARCH_INSPECT), rebuild: () => call(API.SEARCH_REBUILD), clear: () => call(API.SEARCH_CLEAR),
      disable: () => call(API.SEARCH_DISABLE), enable: () => call(API.SEARCH_ENABLE)
    },
    sitePreview: {
      previewFolder: (params) => call(API.SITES_PREVIEW_FOLDER, params), buildFolder: (params) => call(API.SITES_BUILD_FOLDER, params),
      stop: (siteId) => call(API.SITES_STOP, { siteId }), status: (siteId) => call(API.SITES_STATUS, { siteId }),
      openExternal: (url) => call(API.SITES_OPEN_EXTERNAL, { url })
    },
    features: { get: () => call(API.FEATURES_GET), set: (key, enabled) => call(API.FEATURES_SET, { key, enabled }) },
    ai: {
      getConfig: () => call(API.AI_CONFIG_GET), setConfig: (config) => call(API.AI_CONFIG_SET, toPlainObject(config)),
      testConfig: (config = {}) => call(API.AI_CONFIG_TEST, toPlainObject(config))
    },
    atomic: { getCatalog: () => call(API.ATOMIC_CATALOG_GET) },
    atomicFeatures: {
      describeApi: () => call(API.ATOMIC_API_DESCRIBE),
      callApi: (action, args = {}) => call(API.ATOMIC_API_CALL, { action, arguments: toPlainObject(args) }),
      providers: () => call(API.ATOMIC_PROVIDERS_LIST),
      overview: (vaultRoot, options = {}) => call(API.ATOMIC_OVERVIEW, normalizeAtomicPayload(vaultRoot, { options })),
      graph: (vaultRoot, options = {}) => call(API.ATOMIC_GRAPH, normalizeAtomicPayload(vaultRoot, { options })),
      wiki: (vaultRoot, options = {}) => call(API.ATOMIC_WIKI, normalizeAtomicPayload(vaultRoot, { options })),
      createWikiPage: (vaultRoot, record) => call(API.ATOMIC_WIKI_CREATE_PAGE, normalizeAtomicPayload(vaultRoot, { record })),
      summarize: (vaultRoot, relativePath, providerConfig = {}) => call(API.ATOMIC_SUMMARIZE, normalizeAtomicPayload(vaultRoot, { relativePath, providerConfig })),
      structure: (vaultRoot, relativePath, providerConfig = {}) => call(API.ATOMIC_STRUCTURE, normalizeAtomicPayload(vaultRoot, { relativePath, providerConfig })),
      autoNameNote: (vaultRoot, relativePath, options = {}) => call(API.ATOMIC_NOTE_AUTO_NAME, normalizeAtomicPayload(vaultRoot, { relativePath, options })),
      listLocalModels: (vaultRoot = '') => call(API.ATOMIC_MODELS_LIST_LOCAL, normalizeAtomicPayload(vaultRoot)),
      pullModel: (id, provider = 'ollama', vaultRoot = '') => call(API.ATOMIC_MODELS_PULL, normalizeAtomicPayload(vaultRoot, { id, provider })),
      onModelPullProgress: (listener) => subscribe(EVENTS.ATOMIC_MODEL_PULL_PROGRESS, listener)
    },
    models: {
      getSelection: () => call(API.MODEL_SELECTION_GET), setSelection: (selection) => call(API.MODEL_SELECTION_SET, selection),
      listLocal: () => call(API.MODELS_LOCAL_LIST), list: (provider = '') => call(API.MODELS_LIST, provider ? { provider } : {}),
      search: modelsSearch, searchHuggingFace: modelsSearch,
      info: (payload = {}) => call(API.MODELS_INFO, normalizeModelPayload(payload)),
      download: (payload) => call(API.MODELS_ACQUIRE, normalizeModelPayload(payload)),
      activate: (payload = {}) => call(API.MODELS_ACTIVATE, normalizeModelPayload(payload)),
      deactivate: (payload = {}) => call(API.MODELS_DEACTIVATE, normalizeModelPayload(payload)),
      remove: (payload = {}) => call(API.MODELS_DELETE, normalizeModelPayload(payload)),
      active: (provider = '') => call(API.MODELS_ACTIVE, provider ? { provider } : {}),
      cancelDownload: (payload = {}) => call(API.MODELS_CANCEL_DOWNLOAD, normalizeModelPayload(payload)),
      downloadStatus: (payload = {}) => call(API.MODELS_DOWNLOAD_STATUS, normalizeModelPayload(payload)),
      refreshIndex: (provider = '') => call(API.MODELS_REFRESH_INDEX, provider ? { provider } : {}),
      onDownloadProgress: (listener) => subscribe(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)
    },
    ocr: { extract: (imagePath, options = {}) => call(API.OCR_EXTRACT, { imagePath, ...options }) },
    sync: {
      status: () => call(API.SYNC_STATUS), plan: (payloadByOperation = {}) => call(API.SYNC_PLAN, payloadByOperation),
      enqueue: (operation, payload = {}) => call(API.SYNC_ENQUEUE, { operation, payload }),
      run: (payloadByOperation = {}) => call(API.SYNC_RUN, payloadByOperation)
    },
    rag: { chat: (payload, limit = 6) => callRagChat(call, payload, limit) },
    agents: {
      list: () => call(API.AGENTS_LIST), register: (payload) => call(API.AGENTS_REGISTER, payload),
      unregister: (id) => call(API.AGENTS_UNREGISTER, { id }), send: (id, message) => call(API.AGENTS_SEND, { id, message })
    },
    plugins: {
      list: () => call(API.PLUGINS_LIST), set: (id, enabled, config = {}) => call(API.PLUGINS_SET, { id, enabled, config }),
      run: (id, input = {}) => call(API.PLUGINS_RUN, { id, input })
    },
    tasks: { list: () => call(API.TASKS_LIST), set: (id, enabled) => call(API.TASKS_SET, { id, enabled }), run: (id) => call(API.TASKS_RUN, { id }) },
    mcp: { listTools: () => call(API.MCP_TOOLS_LIST), callTool: (name, args = {}) => call(API.MCP_TOOLS_CALL, { name, arguments: args }) },
    programs: {
      list: () => call(API.PROGRAMS_LIST), set: (environments = {}) => call(API.PROGRAMS_SET, { environments }),
      run: (id, command, cwd = '') => call(API.PROGRAMS_RUN, { id, command, cwd })
    }
  }
}

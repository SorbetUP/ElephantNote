import { validateApiPayload } from './apiSchemas'

export const ELEPHANTNOTE_API_VERSION = '2026-05-24'

export const ELEPHANTNOTE_API_ACTIONS = Object.freeze({
  API_DESCRIBE: 'api.describe',
  VAULTS_GET: 'vaults.get',
  VAULTS_SELECT: 'vaults.select',
  VAULTS_SET_ACTIVE: 'vaults.setActive',
  DIRECTORY_LIST: 'directory.list',
  NOTES_CREATE: 'notes.create',
  FOLDERS_CREATE: 'folders.create',
  SIDEBAR_ATTACH: 'sidebar.attach',
  SIDEBAR_DETACH: 'sidebar.detach',
  ENTRIES_RENAME: 'entries.rename',
  ENTRIES_DELETE: 'entries.delete',
  IMPORT_GOOGLE_KEEP: 'import.googleKeep',
  IMPORT_GOOGLE_KEEP_FROM_PATHS: 'import.googleKeepFromPaths',
  CALENDAR_LIST: 'calendar.list',
  CALENDAR_IMPORT_GOOGLE: 'calendar.importGoogle',
  CALENDAR_IMPORT_GOOGLE_FROM_PATH: 'calendar.importGoogleFromPath',
  CALENDAR_GOOGLE_CONFIG_GET: 'calendar.google.config.get',
  CALENDAR_GOOGLE_CONFIG_SET: 'calendar.google.config.set',
  CALENDAR_GOOGLE_SYNC: 'calendar.google.sync',
  SOURCES_LIST: 'sources.list',
  SOURCES_INGEST_URL: 'sources.ingestUrl',
  SOURCES_IMPORT_RSS: 'sources.importRss',
  WIKI_LIST: 'wiki.list',
  WIKI_PROPOSE: 'wiki.propose',
  WIKI_ACCEPT: 'wiki.accept',
  WIKI_DISMISS: 'wiki.dismiss',
  SEARCH_INIT_VAULT: 'search.initVault',
  SEARCH_QUERY: 'search.query',
  SEARCH_STATUS: 'search.status',
  SEARCH_INSPECT: 'search.inspect',
  SEARCH_REBUILD: 'search.rebuild',
  SEARCH_CLEAR: 'search.clear',
  SEARCH_DISABLE: 'search.disable',
  SEARCH_ENABLE: 'search.enable',
  SITES_PREVIEW_FOLDER: 'sites.previewFolder',
  SITES_BUILD_FOLDER: 'sites.buildFolder',
  SITES_STOP: 'sites.stop',
  SITES_STATUS: 'sites.status',
  SITES_OPEN_EXTERNAL: 'sites.openExternal',
  AGENTS_LIST: 'agents.list',
  AGENTS_REGISTER: 'agents.register',
  AGENTS_UNREGISTER: 'agents.unregister',
  AGENTS_SEND: 'agents.send',
  RAG_CHAT: 'rag.chat',
  NOTES_AUTOTAG: 'notes.autotag',
  MCP_TOOLS_LIST: 'mcp.tools.list',
  MCP_TOOLS_CALL: 'mcp.tools.call',
  AI_CONFIG_GET: 'ai.config.get',
  AI_CONFIG_SET: 'ai.config.set',
  FEATURES_GET: 'features.get',
  FEATURES_SET: 'features.set',
  ATOMIC_CATALOG_GET: 'atomic.catalog.get',
  MODEL_SELECTION_GET: 'models.selection.get',
  MODEL_SELECTION_SET: 'models.selection.set',
  MODELS_LOCAL_LIST: 'models.local.list',
  MODELS_DOWNLOAD: 'models.download',
  PLUGINS_LIST: 'plugins.list',
  PLUGINS_SET: 'plugins.set',
  PLUGINS_RUN: 'plugins.run',
  TASKS_LIST: 'tasks.list',
  TASKS_SET: 'tasks.set',
  TASKS_RUN: 'tasks.run',
  PROGRAMS_LIST: 'programs.list',
  PROGRAMS_SET: 'programs.set',
  PROGRAMS_RUN: 'programs.run',
  SYNC_STATUS: 'sync.status',
  SYNC_ENQUEUE: 'sync.enqueue',
  SYNC_RUN: 'sync.run'
})

const normalizeAction = (action) => String(action || '').trim()

export const createApiResponse = ({ ok, action, data, error }) => ({
  ok,
  version: ELEPHANTNOTE_API_VERSION,
  action,
  data: ok
    ? data
    : undefined,
  error: ok
    ? undefined
    : {
      message: error?.message || String(error || 'API request failed.'),
      code: error?.code || 'ELEPHANTNOTE_API_ERROR'
    }
})

export const createElephantNoteApi = ({ handlers = {} } = {}) => {
  const registry = new Map(Object.entries(handlers))

  const describe = () => ({
    version: ELEPHANTNOTE_API_VERSION,
    actions: [...registry.keys()].sort()
  })

  registry.set(ELEPHANTNOTE_API_ACTIONS.API_DESCRIBE, async() => describe())

  const call = async(actionName, payload = {}, context = {}) => {
    const action = normalizeAction(actionName)
    const handler = registry.get(action)
    if (!handler) {
      const error = new Error(`Unknown ElephantNote API action: ${action || '(empty)'}.`)
      error.code = 'ELEPHANTNOTE_UNKNOWN_API_ACTION'
      throw error
    }
    return handler(validateApiPayload(action, payload), context)
  }

  const callEnvelope = async(actionName, payload = {}, context = {}) => {
    const action = normalizeAction(actionName)
    try {
      return createApiResponse({
        ok: true,
        action,
        data: await call(action, payload, context)
      })
    } catch (error) {
      return createApiResponse({ ok: false, action, error })
    }
  }

  return {
    version: ELEPHANTNOTE_API_VERSION,
    describe,
    call,
    callEnvelope,
    hasAction: (actionName) => registry.has(normalizeAction(actionName)),
    listActions: () => [...registry.keys()].sort()
  }
}

export const registerElephantNoteApiIpc = ({ ipcMain, api }) => {
  ipcMain.handle('elephantnote:api:describe', async() => api.describe())
  ipcMain.handle('elephantnote:api:call', async(event, request = {}) => {
    return api.callEnvelope(request.action, request.payload || {}, {
      event,
      windowId: request.windowId || request.payload?.windowId
    })
  })
}

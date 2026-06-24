export const ELEPHANTNOTE_API_VERSION = '2026-05-24'
import { SYNC_OPERATION_IDS } from './sync'

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const optionalString = (value) => value === undefined || typeof value === 'string'

const requiredString = (value) => typeof value === 'string' && value.trim().length > 0

const textString = (value) => typeof value === 'string'

const optionalBoolean = (value) => value === undefined || typeof value === 'boolean'

const optionalNumber = (value) => value === undefined || Number.isFinite(Number(value))

const optionalObject = (value) => value === undefined || isPlainObject(value)

const optionalSyncOperationArray = (value) =>
  value === undefined || (Array.isArray(value) && value.every((item) => SYNC_OPERATION_IDS.includes(item)))

const optionalEnum = (allowed) => (value) => value === undefined || allowed.includes(value)

const requiredEnum = (allowed) => (value) => allowed.includes(value)

const assertObject = (payload, action) => {
  if (!isPlainObject(payload)) {
    const error = new Error(`Invalid payload for ${action}: expected an object.`)
    error.code = 'ELEPHANTNOTE_INVALID_API_PAYLOAD'
    throw error
  }
}

const assertField = (payload, field, validator, action) => {
  if (!validator(payload[field])) {
    const error = new Error(`Invalid payload for ${action}: field "${field}" is invalid.`)
    error.code = 'ELEPHANTNOTE_INVALID_API_PAYLOAD'
    throw error
  }
}

export const schema = Object.freeze({
  empty: (payload, action) => {
    assertObject(payload, action)
    return payload
  },
  object: (fields = {}) => (payload, action) => {
    assertObject(payload, action)
    for (const [field, validator] of Object.entries(fields)) {
      assertField(payload, field, validator, action)
    }
    return payload
  },
  strictObject: (fields = {}) => (payload, action) => {
    assertObject(payload, action)
    for (const field of Object.keys(payload)) {
      if (!Object.prototype.hasOwnProperty.call(fields, field)) {
        const error = new Error(`Invalid payload for ${action}: field "${field}" is not supported.`)
        error.code = 'ELEPHANTNOTE_INVALID_API_PAYLOAD'
        throw error
      }
    }
    for (const [field, validator] of Object.entries(fields)) {
      assertField(payload, field, validator, action)
    }
    return payload
  },
  optionalString,
  requiredString,
  textString,
  optionalBoolean,
  optionalNumber,
  optionalObject,
  optionalSyncOperationArray,
  optionalEnum,
  requiredEnum
})

const action = (key, name, payload = schema.empty) => ({ key, name, payload })

const aiConfigPayload = schema.strictObject({
  preset: optionalString,
  name: optionalString,
  provider: optionalString,
  transport: optionalString,
  endpoint: optionalString,
  model: optionalString,
  apiKey: optionalString,
  codexLinkEnabled: optionalBoolean,
  defaultProvider: optionalString,
  localAi: optionalObject,
  providers: optionalObject,
  routes: optionalObject,
  localModelSelection: optionalObject,
  rag: optionalObject,
  tools: optionalObject,
  search: optionalObject,
  indexing: optionalObject,
  ocr: optionalObject,
  temperature: optionalNumber,
  maxTokens: optionalNumber,
  contextWindow: optionalNumber
})

const syncRunPayload = schema.object({
  remotePath: optionalString,
  operations: optionalSyncOperationArray,
  init: optionalObject,
  snapshot: optionalObject,
  sync: optionalObject,
  pull: optionalObject,
  push: optionalObject
})

export const ELEPHANTNOTE_API_DOMAINS = Object.freeze({
  system: Object.freeze([
    action('API_DESCRIBE', 'api.describe')
  ]),
  vaults: Object.freeze([
    action('VAULTS_GET', 'vaults.get'),
    action('VAULTS_SELECT', 'vaults.select'),
    action('VAULTS_SET_ACTIVE', 'vaults.setActive', schema.object({ vaultId: requiredString })),
    action('VAULTS_SET_ICON', 'vaults.setIcon', schema.object({ vaultId: requiredString, icon: optionalString })),
    action('VAULTS_SET_NAME', 'vaults.setName', schema.object({ vaultId: requiredString, name: requiredString })),
    action('VAULTS_REMOVE', 'vaults.remove', schema.object({ vaultId: requiredString }))
  ]),
  documents: Object.freeze([
    action('DIRECTORY_LIST', 'directory.list', schema.object({ relativePath: optionalString })),
    action('NOTES_CREATE', 'notes.create', schema.object({ relativePath: optionalString, filename: optionalString, title: optionalString })),
    action('NOTES_READ', 'notes.read', schema.object({ relativePath: requiredString })),
    action('NOTES_WRITE', 'notes.write', schema.object({ relativePath: requiredString, markdown: textString })),
    action('FOLDERS_CREATE', 'folders.create', schema.object({ relativePath: optionalString })),
    action('SIDEBAR_ATTACH', 'sidebar.attach', schema.object({ relativePath: requiredString, title: optionalString, type: optionalEnum(['note', 'folder']) })),
    action('SIDEBAR_DETACH', 'sidebar.detach', schema.object({ relativePath: requiredString })),
    action('ENTRIES_RENAME', 'entries.rename', schema.object({ relativePath: requiredString, title: requiredString })),
    action('ENTRIES_MOVE', 'entries.move', schema.object({ relativePath: requiredString, targetDirectoryPath: optionalString })),
    action('ENTRIES_DELETE', 'entries.delete', schema.object({ relativePath: requiredString }))
  ]),
  imports: Object.freeze([
    action('IMPORT_GOOGLE_KEEP', 'import.googleKeep'),
    action('IMPORT_GOOGLE_KEEP_FROM_PATHS', 'import.googleKeepFromPaths', schema.object({ sourcePath: requiredString, destinationRelativePath: optionalString })),
    action('CALENDAR_LIST', 'calendar.list'),
    action('CALENDAR_IMPORT_GOOGLE', 'calendar.importGoogle'),
    action('CALENDAR_IMPORT_GOOGLE_FROM_PATH', 'calendar.importGoogleFromPath', schema.object({ sourcePath: requiredString })),
    action('CALENDAR_GOOGLE_CONFIG_GET', 'calendar.google.config.get'),
    action('CALENDAR_GOOGLE_CONFIG_SET', 'calendar.google.config.set', schema.object({ enabled: optionalBoolean, clientId: optionalString, clientSecret: optionalString, refreshToken: optionalString, accessToken: optionalString, calendarId: optionalString })),
    action('CALENDAR_GOOGLE_SYNC', 'calendar.google.sync'),
    action('SOURCES_LIST', 'sources.list'),
    action('SOURCES_INGEST_URL', 'sources.ingestUrl', schema.object({ url: requiredString, destinationRelativePath: optionalString })),
    action('SOURCES_IMPORT_RSS', 'sources.importRss', schema.object({ url: requiredString, destinationRelativePath: optionalString, limit: optionalNumber }))
  ]),
  knowledge: Object.freeze([
    action('WIKI_LIST', 'wiki.list'),
    action('WIKI_PROPOSE', 'wiki.propose'),
    action('WIKI_ACCEPT', 'wiki.accept', schema.object({ id: requiredString })),
    action('WIKI_DISMISS', 'wiki.dismiss', schema.object({ id: requiredString })),
    action('WIKI_SOURCE_INFO', 'wiki.sourceInfo', schema.object({ path: requiredString })),
    action('WIKI_CONTEXT', 'wiki.context', schema.object({ path: requiredString, limit: optionalNumber })),
    action('SEARCH_INIT_VAULT', 'search.initVault', schema.object({ vaultPath: requiredString })),
    action('SEARCH_QUERY', 'search.query', schema.object({ query: requiredString, mode: optionalEnum(['smart', 'exact', 'semantic']), limit: optionalNumber })),
    action('SEARCH_STATUS', 'search.status'),
    action('SEARCH_INSPECT', 'search.inspect'),
    action('SEARCH_REBUILD', 'search.rebuild'),
    action('SEARCH_CLEAR', 'search.clear'),
    action('SEARCH_DISABLE', 'search.disable'),
    action('SEARCH_ENABLE', 'search.enable'),
    action('RAG_CHAT', 'rag.chat', schema.object({ message: requiredString, limit: optionalNumber })),
    action('NOTES_AUTOTAG', 'notes.autotag', schema.object({ relativePath: requiredString }))
  ]),
  publishing: Object.freeze([
    action('SITES_PREVIEW_FOLDER', 'sites.previewFolder', schema.object({ vaultRoot: requiredString, folderPath: requiredString })),
    action('SITES_BUILD_FOLDER', 'sites.buildFolder', schema.object({ vaultRoot: requiredString, folderPath: requiredString })),
    action('SITES_STOP', 'sites.stop', schema.object({ siteId: requiredString })),
    action('SITES_STATUS', 'sites.status', schema.object({ siteId: requiredString })),
    action('SITES_OPEN_EXTERNAL', 'sites.openExternal', schema.object({ url: requiredString }))
  ]),
  automation: Object.freeze([
    action('AGENTS_LIST', 'agents.list'),
    action('AGENTS_REGISTER', 'agents.register', schema.object({ id: optionalString, name: requiredString, transport: optionalString, endpoint: optionalString, model: optionalString, apiKey: optionalString })),
    action('AGENTS_UNREGISTER', 'agents.unregister', schema.object({ id: requiredString })),
    action('AGENTS_SEND', 'agents.send', schema.object({ id: requiredString, message: requiredString })),
    action('MCP_TOOLS_LIST', 'mcp.tools.list'),
    action('MCP_TOOLS_CALL', 'mcp.tools.call', schema.object({ name: requiredString, arguments: optionalObject })),
    action('TASKS_LIST', 'tasks.list'),
    action('TASKS_SET', 'tasks.set', schema.object({ id: requiredString, enabled: optionalBoolean })),
    action('TASKS_RUN', 'tasks.run', schema.object({ id: requiredString })),
    action('PROGRAMS_LIST', 'programs.list'),
    action('PROGRAMS_SET', 'programs.set', schema.object({ environments: optionalObject })),
    action('PROGRAMS_RUN', 'programs.run', schema.object({ id: requiredString, command: requiredString, cwd: optionalString }))
  ]),
  aiRuntime: Object.freeze([
    action('AI_CONFIG_GET', 'ai.config.get'),
    action('AI_CONFIG_SET', 'ai.config.set', aiConfigPayload),
    action('AI_CONFIG_TEST', 'ai.config.test', schema.object({
      preset: optionalString,
      name: optionalString,
      provider: optionalString,
      transport: optionalString,
      endpoint: optionalString,
      model: optionalString,
      apiKey: optionalString,
      codexLinkEnabled: optionalBoolean
    })),
    action('FEATURES_GET', 'features.get'),
    action('FEATURES_SET', 'features.set', schema.object({ key: requiredString, enabled: optionalBoolean })),
    action('ATOMIC_CATALOG_GET', 'atomic.catalog.get'),
    action('MODEL_SELECTION_GET', 'models.selection.get'),
    action('MODEL_SELECTION_SET', 'models.selection.set', schema.object({ embedding: optionalString, chat: optionalString, tagging: optionalString, naming: optionalString, wiki: optionalString, summary: optionalString, agent: optionalString, ocr: optionalString, 'speech-to-text': optionalString, 'text-to-speech': optionalString })),
    action('MODELS_LOCAL_LIST', 'models.local.list'),
    action('MODELS_DOWNLOAD', 'models.download', schema.object({ id: requiredString })),
    action('OCR_EXTRACT', 'ocr.extract', schema.object({ imagePath: requiredString, language: optionalString, pageSegmentationMode: optionalString }))
  ]),
  plugins: Object.freeze([
    action('PLUGINS_LIST', 'plugins.list'),
    action('PLUGINS_SET', 'plugins.set', schema.object({ id: requiredString, enabled: optionalBoolean, config: optionalObject })),
    action('PLUGINS_RUN', 'plugins.run', schema.object({ id: requiredString, input: optionalObject }))
  ]),
  sync: Object.freeze([
    action('SYNC_STATUS', 'sync.status'),
    action('SYNC_PLAN', 'sync.plan', syncRunPayload),
    action('SYNC_ENQUEUE', 'sync.enqueue', schema.object({ operation: requiredEnum(SYNC_OPERATION_IDS), payload: optionalObject })),
    action('SYNC_RUN', 'sync.run', syncRunPayload)
  ])
})

export const listApiContracts = () => Object.values(ELEPHANTNOTE_API_DOMAINS).flat()

export const ELEPHANTNOTE_API_ACTIONS = Object.freeze(
  Object.fromEntries(listApiContracts().map(({ key, name }) => [key, name]))
)

export const API_PAYLOAD_SCHEMAS = Object.freeze(
  Object.fromEntries(listApiContracts().map(({ name, payload }) => [name, payload]))
)

export const validateApiPayload = (actionName, payload = {}) => {
  const validator = API_PAYLOAD_SCHEMAS[actionName]
  if (!validator) return payload
  return validator(payload, actionName)
}

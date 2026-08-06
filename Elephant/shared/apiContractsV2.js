import { ELEPHANTNOTE_API_DOMAINS as BASE_DOMAINS } from './apiContracts'
import {
  API_PAYLOAD_SCHEMAS as BASE_PAYLOAD_SCHEMAS,
  ELEPHANTNOTE_API_ACTIONS as BASE_ACTIONS,
  ELEPHANTNOTE_API_VERSION as BASE_VERSION,
  listApiContracts as listBaseApiContracts,
  schema,
  validateApiPayload as validateBaseApiPayload
} from './apiContractsRuntime'

export const ELEPHANTNOTE_API_VERSION = BASE_VERSION
export const ELEPHANTNOTE_API_CONTRACT_REVISION = 2
export const ELEPHANTNOTE_API_CONTRACT_ID = `${BASE_VERSION}.${ELEPHANTNOTE_API_CONTRACT_REVISION}`

const action = (key, name, payload = schema.empty) => ({ key, name, payload })
const requiredObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const requiredNumber = (value) => Number.isFinite(Number(value))

const optionalProviderPayload = schema.object({
  provider: schema.optionalString
})

const modelPayload = schema.object({
  provider: schema.optionalString,
  id: schema.optionalString,
  modelId: schema.optionalString,
  modelRef: schema.optionalString,
  repoId: schema.optionalString,
  originalRepoId: schema.optionalString,
  uri: schema.optionalString,
  pull: schema.optionalString,
  model: schema.optionalString,
  name: schema.optionalString,
  path: schema.optionalString,
  modelPath: schema.optionalString,
  filename: schema.optionalString,
  fileName: schema.optionalString,
  revision: schema.optionalString,
  source: schema.optionalString,
  libraryName: schema.optionalString,
  library: schema.optionalString,
  query: schema.optionalString,
  sort: schema.optionalString,
  direction: schema.optionalNumber,
  limit: schema.optionalNumber,
  sizeBytes: schema.optionalNumber,
  force: schema.optionalBoolean,
  options: schema.optionalObject
})

const modelIdentifier = (payload = {}) =>
  payload.id ||
  payload.modelId ||
  payload.modelRef ||
  payload.repoId ||
  payload.originalRepoId ||
  payload.uri ||
  payload.pull ||
  payload.model ||
  payload.path ||
  payload.modelPath ||
  payload.libraryName ||
  payload.library

const modelAcquirePayload = (payload, actionName) => {
  modelPayload(payload, actionName)
  const identifier = modelIdentifier(payload)
  if (typeof identifier !== 'string' || !identifier.trim()) {
    const error = new Error(
      `Invalid payload for ${actionName}: one model identifier is required.`
    )
    error.code = 'ELEPHANTNOTE_INVALID_API_PAYLOAD'
    throw error
  }
  return payload
}

const atomicWorkspacePayload = schema.object({
  vaultRoot: schema.optionalString,
  relativePath: schema.optionalString,
  provider: schema.optionalString,
  providerConfig: schema.optionalObject,
  options: schema.optionalObject,
  record: schema.optionalObject,
  id: schema.optionalString,
  action: schema.optionalString,
  arguments: schema.optionalObject
})

const markdownPayload = schema.object({ markdown: schema.textString })
const markdownSelectionPayload = schema.object({
  markdown: schema.textString,
  selection: schema.optionalObject
})
const editStatePayload = schema.object({ state: requiredObject })
const compositionStatePayload = schema.object({ state: requiredObject })

const providerContracts = Object.freeze([
  action('CALENDAR_PROVIDERS_LIST', 'calendar.providers.list'),
  action(
    'CALENDAR_IMPORT',
    'calendar.import',
    schema.object({
      provider: schema.requiredString,
      sourcePath: schema.optionalString,
      destinationRelativePath: schema.optionalString,
      options: schema.optionalObject
    })
  ),
  action(
    'CALENDAR_PROVIDER_CONFIG_GET',
    'calendar.provider.config.get',
    schema.object({ provider: schema.requiredString })
  ),
  action(
    'CALENDAR_PROVIDER_CONFIG_SET',
    'calendar.provider.config.set',
    schema.object({
      provider: schema.requiredString,
      config: schema.optionalObject
    })
  ),
  action(
    'CALENDAR_SYNC',
    'calendar.sync',
    schema.object({
      provider: schema.requiredString,
      options: schema.optionalObject
    })
  )
])

const modelContracts = Object.freeze([
  action('MODELS_LIST', 'models.list', optionalProviderPayload),
  action('MODELS_SEARCH', 'models.search', modelPayload),
  action('MODELS_INFO', 'models.info', modelPayload),
  action('MODELS_ACQUIRE', 'models.acquire', modelAcquirePayload),
  action('MODELS_ACTIVATE', 'models.activate', modelAcquirePayload),
  action('MODELS_DEACTIVATE', 'models.deactivate', modelPayload),
  action('MODELS_DELETE', 'models.delete', modelAcquirePayload),
  action('MODELS_ACTIVE', 'models.active', optionalProviderPayload),
  action('MODELS_CANCEL_DOWNLOAD', 'models.cancelDownload', modelPayload),
  action('MODELS_DOWNLOAD_STATUS', 'models.downloadStatus', modelPayload),
  action('MODELS_REFRESH_INDEX', 'models.refreshIndex', optionalProviderPayload)
])

const atomicContracts = Object.freeze([
  action('ATOMIC_API_DESCRIBE', 'atomic.api.describe'),
  action('ATOMIC_API_CALL', 'atomic.api.call', atomicWorkspacePayload),
  action('ATOMIC_PROVIDERS_LIST', 'atomic.providers.list'),
  action('ATOMIC_OVERVIEW', 'atomic.overview', atomicWorkspacePayload),
  action('ATOMIC_GRAPH', 'atomic.graph', atomicWorkspacePayload),
  action('ATOMIC_WIKI', 'atomic.wiki', atomicWorkspacePayload),
  action('ATOMIC_WIKI_CREATE_PAGE', 'atomic.wiki.createPage', atomicWorkspacePayload),
  action('ATOMIC_SUMMARIZE', 'atomic.summarize', atomicWorkspacePayload),
  action('ATOMIC_STRUCTURE', 'atomic.structure', atomicWorkspacePayload),
  action('ATOMIC_NOTE_AUTO_NAME', 'atomic.note.autoName', atomicWorkspacePayload),
  action('ATOMIC_MODELS_LIST_LOCAL', 'atomic.models.listLocal', atomicWorkspacePayload),
  action('ATOMIC_MODELS_PULL', 'atomic.models.pull', atomicWorkspacePayload)
])

const markdownContracts = Object.freeze([
  action('MARKDOWN_PARSE', 'markdown.parse', markdownPayload),
  action('MARKDOWN_RENDER_HTML', 'markdown.renderHtml', markdownPayload),
  action('MARKDOWN_TO_TEXT', 'markdown.toText', markdownPayload),
  action('MARKDOWN_EXTRACT_FRONTMATTER', 'markdown.extractFrontmatter', markdownPayload),
  action('MARKDOWN_EXTRACT_LINKS', 'markdown.extractLinks', markdownPayload)
])

const editorEngineContracts = Object.freeze([
  action('MUYA_PARSE', 'muya.parse', markdownPayload),
  action('MUYA_RENDER_HTML', 'muya.renderHtml', markdownPayload),
  action('MUYA_TOKENS', 'muya.tokens', markdownPayload),
  action('MUYA_EXTRAS', 'muya.extras', markdownPayload),
  action('MUYA_CONTRACT', 'muya.contract', markdownPayload),
  action('MUYA_CLIPBOARD', 'muya.clipboard', markdownSelectionPayload),
  action('MUYA_COPY_MARKDOWN', 'muya.copyMarkdown', markdownSelectionPayload),
  action('MUYA_COPY_HTML', 'muya.copyHtml', markdownSelectionPayload),
  action(
    'MUYA_PASTE',
    'muya.paste',
    schema.object({ state: requiredObject, text: schema.textString })
  ),
  action('MUYA_BACKSPACE', 'muya.backspace', editStatePayload),
  action('MUYA_REMOVE_NEXT', 'muya.removeNext', editStatePayload),
  action('MUYA_UNDO', 'muya.undo', editStatePayload),
  action('MUYA_REDO', 'muya.redo', editStatePayload),
  action(
    'MUYA_MOVE_CURSOR',
    'muya.moveCursor',
    schema.object({
      markdown: schema.textString,
      cursor: requiredNumber,
      direction: schema.requiredString,
      extend: schema.optionalBoolean,
      anchor: schema.optionalNumber
    })
  ),
  action(
    'MUYA_INPUT_RULE',
    'muya.inputRule',
    schema.object({ lineBeforeCursor: schema.textString })
  ),
  action(
    'MUYA_TABLE_INSERT_ROW',
    'muya.tableInsertRow',
    schema.object({ markdown: schema.textString, rowIndex: requiredNumber })
  ),
  action(
    'MUYA_TABLE_INSERT_COLUMN',
    'muya.tableInsertColumn',
    schema.object({ markdown: schema.textString, columnIndex: requiredNumber })
  ),
  action('MUYA_TABLE_CONTRACT', 'muya.tableContract', markdownPayload),
  action(
    'MUYA_IMAGE_SELECTION',
    'muya.imageSelection',
    schema.object({ markdown: schema.textString, cursor: requiredNumber })
  ),
  action('MUYA_START_COMPOSITION', 'muya.startComposition', compositionStatePayload),
  action(
    'MUYA_UPDATE_COMPOSITION',
    'muya.updateComposition',
    schema.object({ state: requiredObject, text: schema.textString })
  ),
  action('MUYA_COMMIT_COMPOSITION', 'muya.commitComposition', compositionStatePayload),
  action('MUYA_CANCEL_COMPOSITION', 'muya.cancelComposition', compositionStatePayload),
  action('MUYA_EDITOR_SNAPSHOT', 'muya.editorSnapshot', editStatePayload)
])

const extendedContracts = Object.freeze([
  ...providerContracts,
  ...modelContracts,
  ...atomicContracts,
  ...markdownContracts,
  ...editorEngineContracts
])

export const ELEPHANTNOTE_API_DOMAINS = Object.freeze({
  ...BASE_DOMAINS,
  providers: providerContracts,
  modelLibrary: modelContracts,
  atomicFeatures: atomicContracts,
  markdownEngine: markdownContracts,
  editorEngine: editorEngineContracts
})

export const listApiContracts = () => [
  ...listBaseApiContracts(),
  ...extendedContracts
]

export const ELEPHANTNOTE_API_ACTIONS = Object.freeze({
  ...BASE_ACTIONS,
  ...Object.fromEntries(extendedContracts.map(({ key, name }) => [key, name]))
})

const EXTENDED_PAYLOAD_SCHEMAS = Object.freeze(
  Object.fromEntries(extendedContracts.map(({ name, payload }) => [name, payload]))
)

export const API_PAYLOAD_SCHEMAS = Object.freeze({
  ...BASE_PAYLOAD_SCHEMAS,
  ...EXTENDED_PAYLOAD_SCHEMAS
})

export const validateApiPayload = (actionName, payload = {}) => {
  const extendedValidator = EXTENDED_PAYLOAD_SCHEMAS[actionName]
  if (extendedValidator) return extendedValidator(payload, actionName)
  if (BASE_PAYLOAD_SCHEMAS[actionName]) return validateBaseApiPayload(actionName, payload)
  const error = new Error(`Unknown ElephantNote API action: ${actionName || '(empty)'}.`)
  error.code = 'ELEPHANTNOTE_UNKNOWN_API_ACTION'
  throw error
}

export const ELEPHANTNOTE_API_EVENT_TOPICS = Object.freeze({
  MODELS_DOWNLOAD_PROGRESS: 'models.download.progress',
  ATOMIC_MODEL_PULL_PROGRESS: 'atomic.models.pull.progress'
})

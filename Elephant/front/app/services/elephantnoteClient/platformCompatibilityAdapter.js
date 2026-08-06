import { ELEPHANTNOTE_API_ACTIONS as API, ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS } from 'common/elephantnote/apiContractsV2'
import { toPlainObject } from '../../../../shared/plainObject.js'

const getBridge = (target = globalThis) => target?.window?.elephantnote || target?.elephantnote || null

const unsupportedProvider = (domain, provider) => {
  const error = new Error(`${domain} provider is not supported: ${provider || '(empty)'}.`)
  error.code = 'ELEPHANTNOTE_UNSUPPORTED_PROVIDER'
  throw error
}

const requireMethod = (value, label) => {
  if (typeof value !== 'function') {
    const error = new Error(`ElephantNote compatibility method is unavailable: ${label}.`)
    error.code = 'ELEPHANTNOTE_COMPATIBILITY_METHOD_UNAVAILABLE'
    throw error
  }
  return value
}

const modelPayload = (payload = {}) => {
  if (typeof payload === 'string') return { id: payload }
  return toPlainObject(payload)
}

const flattenOptions = (payload = {}) => {
  const normalized = toPlainObject(payload)
  const options = toPlainObject(normalized.options || {})
  const base = { ...normalized }
  delete base.options
  return { ...base, ...options }
}

const MARKDOWN_ACTIONS = Object.freeze(new Set([
  API.MARKDOWN_PARSE,
  API.MARKDOWN_RENDER_HTML,
  API.MARKDOWN_TO_TEXT,
  API.MARKDOWN_EXTRACT_FRONTMATTER,
  API.MARKDOWN_EXTRACT_LINKS
]))

const EDITOR_ENGINE_ACTIONS = Object.freeze(new Set([
  API.MUYA_PARSE,
  API.MUYA_RENDER_HTML,
  API.MUYA_TOKENS,
  API.MUYA_EXTRAS,
  API.MUYA_CONTRACT,
  API.MUYA_CLIPBOARD,
  API.MUYA_COPY_MARKDOWN,
  API.MUYA_COPY_HTML,
  API.MUYA_PASTE,
  API.MUYA_BACKSPACE,
  API.MUYA_REMOVE_NEXT,
  API.MUYA_UNDO,
  API.MUYA_REDO,
  API.MUYA_MOVE_CURSOR,
  API.MUYA_INPUT_RULE,
  API.MUYA_TABLE_INSERT_ROW,
  API.MUYA_TABLE_INSERT_COLUMN,
  API.MUYA_TABLE_CONTRACT,
  API.MUYA_IMAGE_SELECTION,
  API.MUYA_START_COMPOSITION,
  API.MUYA_UPDATE_COMPOSITION,
  API.MUYA_COMMIT_COMPOSITION,
  API.MUYA_CANCEL_COMPOSITION,
  API.MUYA_EDITOR_SNAPSHOT
]))

const ASSET_ACTIONS = Object.freeze(new Set([
  API.ATTACHMENTS_LIST,
  API.ATTACHMENTS_WRITE_TEXT,
  API.DRAWINGS_LIST,
  API.DRAWINGS_CREATE,
  API.DRAWINGS_READ,
  API.DRAWINGS_WRITE
]))

export const COMPATIBILITY_ACTIONS = Object.freeze(new Set([
  API.CALENDAR_PROVIDERS_LIST,
  API.CALENDAR_IMPORT,
  API.CALENDAR_PROVIDER_CONFIG_GET,
  API.CALENDAR_PROVIDER_CONFIG_SET,
  API.CALENDAR_SYNC,
  API.MODELS_LIST,
  API.MODELS_SEARCH,
  API.MODELS_INFO,
  API.MODELS_ACQUIRE,
  API.MODELS_ACTIVATE,
  API.MODELS_DEACTIVATE,
  API.MODELS_DELETE,
  API.MODELS_ACTIVE,
  API.MODELS_CANCEL_DOWNLOAD,
  API.MODELS_DOWNLOAD_STATUS,
  API.MODELS_REFRESH_INDEX,
  API.SEARCH_CONCEPTS,
  API.ATOMIC_API_DESCRIBE,
  API.ATOMIC_API_CALL,
  API.ATOMIC_PROVIDERS_LIST,
  API.ATOMIC_OVERVIEW,
  API.ATOMIC_GRAPH,
  API.ATOMIC_WIKI,
  API.ATOMIC_WIKI_CREATE_PAGE,
  API.ATOMIC_SUMMARIZE,
  API.ATOMIC_STRUCTURE,
  API.ATOMIC_NOTE_AUTO_NAME,
  API.ATOMIC_MODELS_LIST_LOCAL,
  API.ATOMIC_MODELS_PULL,
  ...MARKDOWN_ACTIONS,
  ...EDITOR_ENGINE_ACTIONS,
  ...ASSET_ACTIONS
]))

export const createPlatformCompatibilityAdapter = (target = globalThis) => {
  const bridge = () => getBridge(target)

  const callCalendar = (action, payload = {}) => {
    const provider = String(payload.provider || 'google').trim().toLowerCase()
    if (provider !== 'google') unsupportedProvider('Calendar', provider)
    const calendar = bridge()?.calendar || {}
    if (action === API.CALENDAR_PROVIDERS_LIST) return Promise.resolve([{ id: 'google', available: true }])
    if (action === API.CALENDAR_IMPORT) {
      if (payload.sourcePath) {
        return requireMethod(calendar.importGoogleFromPath, 'calendar.importGoogleFromPath')({
          sourcePath: payload.sourcePath
        })
      }
      return requireMethod(calendar.importGoogle, 'calendar.importGoogle')()
    }
    if (action === API.CALENDAR_PROVIDER_CONFIG_GET) {
      return requireMethod(calendar.googleConfigGet, 'calendar.googleConfigGet')()
    }
    if (action === API.CALENDAR_PROVIDER_CONFIG_SET) {
      return requireMethod(calendar.googleConfigSet, 'calendar.googleConfigSet')(
        toPlainObject(payload.config || {})
      )
    }
    return requireMethod(calendar.googleSync, 'calendar.googleSync')(
      toPlainObject(payload.options || {})
    )
  }

  const callModels = (action, payload = {}) => {
    const models = bridge()?.models || {}
    const normalized = modelPayload(payload)
    const provider = String(normalized.provider || '').trim().toLowerCase()
    if (action === API.MODELS_LIST) return requireMethod(models.list, 'models.list')()
    if (action === API.MODELS_SEARCH) {
      if (provider && provider !== 'huggingface') unsupportedProvider('Model search', provider)
      return requireMethod(models.searchHuggingFace, 'models.searchHuggingFace')(normalized)
    }
    if (action === API.MODELS_INFO) return requireMethod(models.info, 'models.info')(normalized)
    if (action === API.MODELS_ACQUIRE) return requireMethod(models.download, 'models.download')(normalized)
    if (action === API.MODELS_ACTIVATE) return requireMethod(models.activate, 'models.activate')(normalized)
    if (action === API.MODELS_DEACTIVATE) return requireMethod(models.deactivate, 'models.deactivate')(normalized)
    if (action === API.MODELS_DELETE) return requireMethod(models.remove, 'models.remove')(normalized)
    if (action === API.MODELS_ACTIVE) return requireMethod(models.active, 'models.active')()
    if (action === API.MODELS_CANCEL_DOWNLOAD) {
      return requireMethod(models.cancelDownload, 'models.cancelDownload')(normalized)
    }
    if (action === API.MODELS_DOWNLOAD_STATUS) {
      return requireMethod(models.downloadStatus, 'models.downloadStatus')(normalized)
    }
    return requireMethod(models.refreshIndex, 'models.refreshIndex')()
  }

  const callAtomic = (action, payload = {}) => {
    const atomic = bridge()?.atomicFeatures || {}
    const normalized = toPlainObject(payload)
    if (action === API.ATOMIC_API_DESCRIBE) return requireMethod(atomic.describeApi, 'atomicFeatures.describeApi')()
    if (action === API.ATOMIC_API_CALL) {
      return requireMethod(atomic.callApi, 'atomicFeatures.callApi')({
        action: normalized.action,
        arguments: normalized.arguments || {}
      })
    }
    if (action === API.ATOMIC_PROVIDERS_LIST) return requireMethod(atomic.providers, 'atomicFeatures.providers')()
    if (action === API.ATOMIC_OVERVIEW) {
      return requireMethod(atomic.overview, 'atomicFeatures.overview')(flattenOptions(normalized))
    }
    if (action === API.ATOMIC_GRAPH) {
      return requireMethod(atomic.graph, 'atomicFeatures.graph')(flattenOptions(normalized))
    }
    if (action === API.ATOMIC_WIKI) {
      return requireMethod(atomic.wiki, 'atomicFeatures.wiki')(flattenOptions(normalized))
    }
    if (action === API.ATOMIC_WIKI_CREATE_PAGE) {
      return requireMethod(atomic.createWikiPage, 'atomicFeatures.createWikiPage')(normalized)
    }
    if (action === API.ATOMIC_SUMMARIZE) return requireMethod(atomic.summarize, 'atomicFeatures.summarize')(normalized)
    if (action === API.ATOMIC_STRUCTURE) return requireMethod(atomic.structure, 'atomicFeatures.structure')(normalized)
    if (action === API.ATOMIC_NOTE_AUTO_NAME) {
      return requireMethod(atomic.autoNameNote, 'atomicFeatures.autoNameNote')(flattenOptions(normalized))
    }
    if (action === API.ATOMIC_MODELS_LIST_LOCAL) {
      return requireMethod(atomic.listLocalModels, 'atomicFeatures.listLocalModels')(normalized)
    }
    return requireMethod(atomic.pullModel, 'atomicFeatures.pullModel')(normalized)
  }

  const callMarkdown = (action, payload = {}) => {
    const markdown = bridge()?.markdown || {}
    const methods = {
      [API.MARKDOWN_PARSE]: ['parse', markdown.parse],
      [API.MARKDOWN_RENDER_HTML]: ['renderHtml', markdown.renderHtml],
      [API.MARKDOWN_TO_TEXT]: ['toText', markdown.toText],
      [API.MARKDOWN_EXTRACT_FRONTMATTER]: ['extractFrontmatter', markdown.extractFrontmatter],
      [API.MARKDOWN_EXTRACT_LINKS]: ['extractLinks', markdown.extractLinks]
    }
    const [name, method] = methods[action] || []
    return requireMethod(method, `markdown.${name || action}`)(toPlainObject(payload))
  }

  const callEditorEngine = (action, payload = {}) => {
    const muya = bridge()?.muya || {}
    const methods = {
      [API.MUYA_PARSE]: ['parse', muya.parse],
      [API.MUYA_RENDER_HTML]: ['renderHtml', muya.renderHtml],
      [API.MUYA_TOKENS]: ['tokens', muya.tokens],
      [API.MUYA_EXTRAS]: ['extras', muya.extras],
      [API.MUYA_CONTRACT]: ['contract', muya.contract],
      [API.MUYA_CLIPBOARD]: ['clipboard', muya.clipboard],
      [API.MUYA_COPY_MARKDOWN]: ['copyMarkdown', muya.copyMarkdown],
      [API.MUYA_COPY_HTML]: ['copyHtml', muya.copyHtml],
      [API.MUYA_PASTE]: ['paste', muya.paste],
      [API.MUYA_BACKSPACE]: ['backspace', muya.backspace],
      [API.MUYA_REMOVE_NEXT]: ['removeNext', muya.removeNext],
      [API.MUYA_UNDO]: ['undo', muya.undo],
      [API.MUYA_REDO]: ['redo', muya.redo],
      [API.MUYA_MOVE_CURSOR]: ['moveCursor', muya.moveCursor],
      [API.MUYA_INPUT_RULE]: ['inputRule', muya.inputRule],
      [API.MUYA_TABLE_INSERT_ROW]: ['tableInsertRow', muya.tableInsertRow],
      [API.MUYA_TABLE_INSERT_COLUMN]: ['tableInsertColumn', muya.tableInsertColumn],
      [API.MUYA_TABLE_CONTRACT]: ['tableContract', muya.tableContract],
      [API.MUYA_IMAGE_SELECTION]: ['imageSelection', muya.imageSelection],
      [API.MUYA_START_COMPOSITION]: ['startComposition', muya.startComposition],
      [API.MUYA_UPDATE_COMPOSITION]: ['updateComposition', muya.updateComposition],
      [API.MUYA_COMMIT_COMPOSITION]: ['commitComposition', muya.commitComposition],
      [API.MUYA_CANCEL_COMPOSITION]: ['cancelComposition', muya.cancelComposition],
      [API.MUYA_EDITOR_SNAPSHOT]: ['editorSnapshot', muya.editorSnapshot]
    }
    const [name, method] = methods[action] || []
    return requireMethod(method, `muya.${name || action}`)(toPlainObject(payload))
  }

  const callAssets = (action, payload = {}) => {
    const attachments = bridge()?.attachments || {}
    const drawings = bridge()?.drawings || {}
    if (action === API.ATTACHMENTS_LIST) {
      return requireMethod(attachments.list, 'attachments.list')()
    }
    if (action === API.ATTACHMENTS_WRITE_TEXT) {
      return requireMethod(attachments.writeText, 'attachments.writeText')(toPlainObject(payload))
    }
    if (action === API.DRAWINGS_LIST) return requireMethod(drawings.list, 'drawings.list')()
    if (action === API.DRAWINGS_CREATE) {
      return requireMethod(drawings.create, 'drawings.create')(toPlainObject(payload))
    }
    if (action === API.DRAWINGS_READ) {
      return requireMethod(drawings.read, 'drawings.read')(toPlainObject(payload))
    }
    return requireMethod(drawings.write, 'drawings.write')(toPlainObject(payload))
  }

  return {
    canHandle: (action) => COMPATIBILITY_ACTIONS.has(action),
    async call(action, payload = {}) {
      if (!COMPATIBILITY_ACTIONS.has(action)) {
        const error = new Error(`No compatibility route for API action: ${action}.`)
        error.code = 'ELEPHANTNOTE_COMPATIBILITY_ACTION_UNAVAILABLE'
        throw error
      }
      if (action.startsWith('calendar.')) return callCalendar(action, payload)
      if (action.startsWith('models.')) return callModels(action, payload)
      if (MARKDOWN_ACTIONS.has(action)) return callMarkdown(action, payload)
      if (EDITOR_ENGINE_ACTIONS.has(action)) return callEditorEngine(action, payload)
      if (ASSET_ACTIONS.has(action)) return callAssets(action, payload)
      if (action === API.SEARCH_CONCEPTS) {
        return requireMethod(bridge()?.search?.concepts, 'search.concepts')(toPlainObject(payload))
      }
      return callAtomic(action, payload)
    },
    subscribe(topic, listener) {
      if (typeof listener !== 'function') return () => {}
      if (topic === EVENTS.MODELS_DOWNLOAD_PROGRESS) {
        return bridge()?.models?.onDownloadProgress?.(listener) || (() => {})
      }
      if (topic === EVENTS.ATOMIC_MODEL_PULL_PROGRESS) {
        return bridge()?.atomicFeatures?.onModelPullProgress?.(listener) || (() => {})
      }
      return () => {}
    }
  }
}

export const platformCompatibilityAdapter = createPlatformCompatibilityAdapter()

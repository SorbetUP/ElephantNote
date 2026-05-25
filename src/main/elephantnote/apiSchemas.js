const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const optionalString = (value) => value === undefined || typeof value === 'string'

const requiredString = (value) => typeof value === 'string' && value.trim().length > 0

const optionalBoolean = (value) => value === undefined || typeof value === 'boolean'

const optionalNumber = (value) => value === undefined || Number.isFinite(Number(value))

const optionalObject = (value) => value === undefined || isPlainObject(value)

const optionalEnum = (allowed) => (value) => value === undefined || allowed.includes(value)

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

const objectSchema = (fields = {}) => (payload, action) => {
  assertObject(payload, action)
  for (const [field, validator] of Object.entries(fields)) {
    assertField(payload, field, validator, action)
  }
  return payload
}

const emptySchema = (payload, action) => {
  assertObject(payload, action)
  return payload
}

export const API_PAYLOAD_SCHEMAS = Object.freeze({
  'api.describe': emptySchema,
  'vaults.get': emptySchema,
  'vaults.select': emptySchema,
  'vaults.setActive': objectSchema({ vaultId: requiredString }),
  'directory.list': objectSchema({ relativePath: optionalString }),
  'notes.create': objectSchema({ relativePath: optionalString }),
  'folders.create': objectSchema({ relativePath: optionalString }),
  'sidebar.attach': objectSchema({
    relativePath: requiredString,
    title: optionalString,
    type: optionalEnum(['note', 'folder'])
  }),
  'sidebar.detach': objectSchema({ relativePath: requiredString }),
  'entries.rename': objectSchema({
    relativePath: requiredString,
    title: requiredString
  }),
  'entries.delete': objectSchema({ relativePath: requiredString }),
  'import.googleKeep': emptySchema,
  'import.googleKeepFromPaths': objectSchema({
    sourcePath: requiredString,
    destinationRelativePath: optionalString
  }),
  'calendar.list': emptySchema,
  'calendar.importGoogle': emptySchema,
  'calendar.importGoogleFromPath': objectSchema({
    sourcePath: requiredString
  }),
  'sources.list': emptySchema,
  'sources.ingestUrl': objectSchema({
    url: requiredString,
    destinationRelativePath: optionalString
  }),
  'sources.importRss': objectSchema({
    url: requiredString,
    destinationRelativePath: optionalString,
    limit: optionalNumber
  }),
  'wiki.list': emptySchema,
  'wiki.propose': emptySchema,
  'wiki.accept': objectSchema({ id: requiredString }),
  'wiki.dismiss': objectSchema({ id: requiredString }),
  'search.initVault': objectSchema({ vaultPath: requiredString }),
  'search.query': objectSchema({
    query: requiredString,
    mode: optionalEnum(['smart', 'exact', 'semantic']),
    limit: optionalNumber
  }),
  'search.status': emptySchema,
  'search.inspect': emptySchema,
  'search.rebuild': emptySchema,
  'search.clear': emptySchema,
  'search.disable': emptySchema,
  'search.enable': emptySchema,
  'sites.previewFolder': objectSchema({
    vaultRoot: requiredString,
    folderPath: requiredString
  }),
  'sites.buildFolder': objectSchema({
    vaultRoot: requiredString,
    folderPath: requiredString
  }),
  'sites.stop': objectSchema({ siteId: requiredString }),
  'sites.status': objectSchema({ siteId: requiredString }),
  'sites.openExternal': objectSchema({ url: requiredString }),
  'agents.list': emptySchema,
  'agents.register': objectSchema({
    id: optionalString,
    name: requiredString,
    transport: optionalString,
    endpoint: optionalString,
    model: optionalString,
    apiKey: optionalString
  }),
  'agents.unregister': objectSchema({ id: requiredString }),
  'agents.send': objectSchema({
    id: requiredString,
    message: requiredString
  }),
  'ai.config.get': emptySchema,
  'ai.config.set': objectSchema({
    enabled: optionalBoolean,
    preset: optionalString,
    name: optionalString,
    transport: optionalString,
    endpoint: optionalString,
    model: optionalString,
    apiKey: optionalString,
    codexLinkEnabled: optionalBoolean
  }),
  'features.get': emptySchema,
  'features.set': objectSchema({
    key: requiredString,
    enabled: optionalBoolean
  }),
  'atomic.catalog.get': emptySchema,
  'models.selection.get': emptySchema,
  'models.selection.set': objectSchema({
    embedding: optionalString,
    chat: optionalString,
    tagging: optionalString,
    wiki: optionalString,
    'speech-to-text': optionalString,
    'text-to-speech': optionalString
  }),
  'plugins.list': emptySchema,
  'plugins.set': objectSchema({
    id: requiredString,
    enabled: optionalBoolean,
    config: optionalObject
  }),
  'tasks.list': emptySchema,
  'tasks.set': objectSchema({
    id: requiredString,
    enabled: optionalBoolean
  }),
  'tasks.run': objectSchema({ id: requiredString }),
  'sync.status': emptySchema,
  'sync.enqueue': objectSchema({
    operation: requiredString,
    payload: optionalObject
  }),
  'sync.run': emptySchema
})

export const validateApiPayload = (action, payload = {}) => {
  const validator = API_PAYLOAD_SCHEMAS[action]
  if (!validator) return payload
  return validator(payload, action)
}

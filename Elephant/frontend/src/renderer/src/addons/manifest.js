export const ADDON_API_VERSION = 1

export const ADDON_STATUS = Object.freeze({
  disabled: 'disabled',
  enabled: 'enabled',
  activating: 'activating',
  error: 'error'
})

const ADDON_ID_RE = /^[a-z0-9][a-z0-9._-]*$/

const normalizeString = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const normalizeObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...value }
}

const normalizePermissions = (value) => {
  if (value == null || typeof value !== 'object') return Object.freeze([])
  if (Array.isArray(value)) return Object.freeze(normalizeStringArray(value))
  const permissions = normalizeObject(value)
  const notes = normalizeObject(permissions.notes)
  const network = normalizeObject(permissions.network)
  return Object.freeze({
    notes: Object.freeze({
      read: Object.freeze(normalizeStringArray(notes.read)),
      write: Object.freeze(normalizeStringArray(notes.write))
    }),
    network: Object.freeze({
      hosts: Object.freeze(normalizeStringArray(network.hosts))
    }),
    storage: permissions.storage === true,
    commands: permissions.commands === true
  })
}

const normalizeRuntime = (value) => {
  const runtime = normalizeObject(value)
  const type = normalizeString(runtime.type)
  const entry = normalizeString(runtime.entry)
  if (!type && !entry) return Object.freeze({})
  return Object.freeze({ type, entry })
}

export const normalizeAddonManifest = (manifest = {}) => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Addon manifest must be an object')
  }

  const id = normalizeString(manifest.id)
  if (!ADDON_ID_RE.test(id)) {
    throw new TypeError('Addon manifest id must use lowercase letters, numbers, dots, dashes or underscores')
  }

  const apiVersion = Number.isInteger(manifest.apiVersion)
    ? manifest.apiVersion
    : ADDON_API_VERSION

  if (apiVersion !== ADDON_API_VERSION) {
    throw new Error(`Unsupported addon apiVersion ${apiVersion}`)
  }

  const name = normalizeString(manifest.name, id)
  const version = normalizeString(manifest.version, '0.0.0')

  return Object.freeze({
    id,
    name,
    version,
    description: normalizeString(manifest.description),
    author: normalizeString(manifest.author),
    apiVersion,
    minAppVersion: normalizeString(manifest.minAppVersion),
    permissions: normalizePermissions(manifest.permissions),
    contributes: Object.freeze(normalizeObject(manifest.contributes)),
    activationEvents: Object.freeze(normalizeStringArray(manifest.activationEvents)),
    runtime: normalizeRuntime(manifest.runtime),
    source: normalizeString(manifest.source, 'builtin'),
    packageHash: normalizeString(manifest.packageHash),
    installedAt: normalizeString(manifest.installedAt),
    defaultEnabled: manifest.defaultEnabled === true
  })
}

export const assertAddonDefinition = (addonDefinition) => {
  if (!addonDefinition || typeof addonDefinition !== 'object' || Array.isArray(addonDefinition)) {
    throw new TypeError('Addon definition must be an object')
  }

  return normalizeAddonManifest(addonDefinition.manifest)
}

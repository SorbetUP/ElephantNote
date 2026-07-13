import { isTrustedAddonManifest } from '../manifest'
import AddonPacksSettings from './ui/AddonPacksSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'
import { invokeTauri, logAction, readNote, writeNote } from './shared'

const ADDON_ID = 'elephant.addon-packs'
const CORE_ADDON_IDS = new Set(['elephant.excalidraw'])
const PACK_DIRECTORY = '.elephantnote/addons/packs'
const DEFAULT_PACK_PATH = `${PACK_DIRECTORY}/default.enaddonpack`
const BASE_PACK_PATH = `${PACK_DIRECTORY}/base.enaddonpack`
const DEVELOP_PARITY_PACK_PATH = `${PACK_DIRECTORY}/develop-parity.enaddonpack`
const REPORT_PATH = 'Reports/Addon Pack.md'
const PACK_FORMAT = 'elephantnote-addon-pack'
const PACK_VERSION = 1
const MAX_PACK_ADDONS = 200

const DEVELOP_PARITY_ADDONS = Object.freeze([
  { id: 'elephant.ai', version: '2.1.0', source: 'official', enabled: true },
  { id: 'elephant.ai-chat', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.ai-search', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.ai-ocr', version: '1.0.0', source: 'official', enabled: true },
  { id: 'elephant.wiki', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.graph', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.open-models', version: '1.2.0', source: 'official', enabled: true },
  { id: 'elephant.codex-connection', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.sync', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.calendar', version: '1.2.0', source: 'official', enabled: true },
  { id: 'elephant.sites', version: '1.1.0', source: 'official', enabled: true },
  { id: 'elephant.code-execution', version: '2.1.0', source: 'official', enabled: true },
  { id: 'elephant.google-keep-import', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.recently-edited', version: '1.0.0', source: 'builtin', enabled: true }
])

const BASE_ADDONS = Object.freeze(
  DEVELOP_PARITY_ADDONS
    .filter((entry) => entry.id !== 'elephant.calendar')
    .map((entry) => Object.freeze({ ...entry }))
)

const readCommunityEnabled = async () => {
  const value = await invokeTauri('tauri_prefs_get', { key: 'addons.communityEnabled' })
  return value === true
}

const normalizePackPath = (value = DEFAULT_PACK_PATH) => {
  const path = String(value || DEFAULT_PACK_PATH).trim().replaceAll('\\', '/')
  if (!path.startsWith(`${PACK_DIRECTORY}/`) || path.includes('/../') || path.endsWith('/..')) {
    throw new Error(`Addon packs must be stored inside ${PACK_DIRECTORY}`)
  }
  if (!path.toLowerCase().endsWith('.enaddonpack')) throw new Error('Addon pack paths must end with .enaddonpack')
  return path
}

const normalizeSource = (value, fallback = 'builtin') => {
  const source = String(value || fallback).trim().toLowerCase()
  if (!['builtin', 'official', 'catalog', 'installed'].includes(source)) {
    throw new Error(`Unsupported addon pack source: ${source}`)
  }
  return source
}

const validatePack = (raw, sourcePath = DEFAULT_PACK_PATH) => {
  let pack
  try { pack = JSON.parse(raw) } catch (error) { throw new Error(`Invalid JSON in ${sourcePath}: ${error.message}`) }
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Addon pack must be a JSON object')
  if (pack.format !== PACK_FORMAT) throw new Error(`Unsupported addon pack format: ${pack.format || 'missing'}`)
  if (pack.version !== PACK_VERSION) throw new Error(`Unsupported addon pack version: ${pack.version}`)
  if (!Array.isArray(pack.addons)) throw new Error('Addon pack must contain an addons array')
  if (pack.addons.length > MAX_PACK_ADDONS) throw new Error(`Addon pack contains more than ${MAX_PACK_ADDONS} addons`)

  const ids = new Set()
  const addons = pack.addons.map((entry, index) => {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    if (!id) throw new Error(`Addon pack entry ${index + 1} has no id`)
    if (id === ADDON_ID) throw new Error('An addon pack cannot disable or replace the Addon Packs manager itself')
    if (ids.has(id)) throw new Error(`Addon pack contains duplicate id: ${id}`)
    ids.add(id)
    if (typeof entry.enabled !== 'boolean') throw new Error(`Addon pack entry ${id} must define enabled as true or false`)
    return {
      id,
      enabled: entry.enabled,
      source: normalizeSource(entry.source),
      version: typeof entry.version === 'string' ? entry.version.trim() : ''
    }
  }).filter((entry) => !CORE_ADDON_IDS.has(entry.id))

  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: typeof pack.name === 'string' && pack.name.trim() ? pack.name.trim() : 'Unnamed addon pack',
    description: typeof pack.description === 'string' ? pack.description.trim() : '',
    addons
  }
}

const createProtectedPack = (name, description, addons) => ({
  format: PACK_FORMAT,
  version: PACK_VERSION,
  name,
  description,
  createdAt: new Date().toISOString(),
  protected: true,
  addons: addons.map((entry) => ({ ...entry }))
})

const createDevelopParityPack = () => createProtectedPack(
  'Elephant Develop parity',
  'Installs and enables every first-party physical addon to reproduce the complete develop application.',
  DEVELOP_PARITY_ADDONS
)
const createBasePack = () => createProtectedPack(
  'Elephant Base',
  'Installs and enables the first-party Elephant setup without Calendar.',
  BASE_ADDONS
)

const isAddonSetCurrent = (pack, expectedAddons) => {
  if (!pack || pack.addons.length !== expectedAddons.length) return false
  const entries = new Map(pack.addons.map((entry) => [entry.id, entry]))
  return expectedAddons.every((expected) => {
    const entry = entries.get(expected.id)
    return entry && entry.source === expected.source && entry.version === expected.version && entry.enabled === expected.enabled
  })
}

const ensureProtectedPack = async ({ path, create, expected }) => {
  try {
    const existing = await readNote(path)
    const parsed = validatePack(existing.content, path)
    if (isAddonSetCurrent(parsed, expected)) return { packPath: path, created: false, updated: false }
  } catch {}
  const pack = create()
  await writeNote(path, `${JSON.stringify(pack, null, 2)}\n`)
  return { packPath: path, created: true, updated: true, pack }
}

const ensureDevelopParityPack = () => ensureProtectedPack({
  path: DEVELOP_PARITY_PACK_PATH,
  create: createDevelopParityPack,
  expected: DEVELOP_PARITY_ADDONS
})
const ensureBasePack = () => ensureProtectedPack({
  path: BASE_PACK_PATH,
  create: createBasePack,
  expected: BASE_ADDONS
})

const createPack = async (ctx, options = {}) => {
  const path = normalizePackPath(options?.path)
  const catalogue = await invokeTauri('tauri_addons_catalog_list')
  const catalogueById = new Map((Array.isArray(catalogue) ? catalogue : []).map((addon) => [addon.id, addon]))
  const addons = ctx.addons.list()
    .filter((addon) => addon?.manifest?.id && addon.manifest.id !== ADDON_ID && !CORE_ADDON_IDS.has(addon.manifest.id))
    .map((addon) => {
      const manifest = addon.manifest
      const isExternal = manifest.source === 'external'
      const official = manifest.official === true || (isExternal && String(manifest.id).startsWith('elephant.') && catalogueById.has(manifest.id))
      const catalogued = catalogueById.has(manifest.id)
      return {
        id: manifest.id,
        version: manifest.version || '',
        source: official ? 'official' : isExternal ? (catalogued ? 'catalog' : 'installed') : 'builtin',
        enabled: addon.enabled === true
      }
    })
    .sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id))

  const pack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: typeof options?.name === 'string' && options.name.trim() ? options.name.trim() : 'Default Elephant pack',
    description: typeof options?.description === 'string'
      ? options.description.trim()
      : 'A portable set of installed built-in, official and community addons with their enabled state.',
    createdAt: new Date().toISOString(),
    addons
  }
  await writeNote(path, `${JSON.stringify(pack, null, 2)}\n`)
  return { path, count: addons.length, pack }
}

const registerCatalogRecord = async (ctx, record) => {
  const external = ctx.addons.external
  if (!external) throw new Error('The physical addon runtime is not available')
  const current = ctx.addons.get(record.manifest.id)
  const rawManager = external.manager || ctx.addonHost?.get?.('addonManager')
  if (!rawManager) throw new Error('The addon manager is unavailable')
  if (current) {
    if (current.enabled || current.status === 'error') await ctx.addons.disable(record.manifest.id).catch(() => {})
    rawManager.unregister(record.manifest.id)
  }
  external.register(record)
}

const prepareTrustedAddon = async (ctx, snapshot) => {
  if (snapshot?.manifest?.official === true) return
  if (!isTrustedAddonManifest(snapshot?.manifest)) return
  const external = ctx.addons.external
  if (!external) throw new Error('The full app access addon runtime is unavailable')
  await external.setSafeMode(false)
  await external.approveTrusted(snapshot.manifest.id)
}

const setExternalEnabled = (id, enabled) => invokeTauri('tauri_addons_set_enabled', {
  addonId: id,
  enabled: enabled === true
})

const applyPack = async (ctx, options = {}) => {
  const path = normalizePackPath(options?.path)
  const note = await readNote(path)
  const pack = validatePack(note.content, path)
  const catalogue = await invokeTauri('tauri_addons_catalog_list')
  const catalogueById = new Map((Array.isArray(catalogue) ? catalogue : []).map((addon) => [addon.id, addon]))
  const requiresCommunity = pack.addons.some((entry) => entry.enabled && ['catalog', 'installed'].includes(entry.source))
  if (requiresCommunity && !await readCommunityEnabled()) {
    throw new Error('Turn on Community Addons before applying a pack that enables third-party addons')
  }

  const results = []
  for (const entry of pack.addons) {
    let snapshot = ctx.addons.get(entry.id)
    let installed = false
    let updated = false

    if (entry.source === 'builtin' && !snapshot) {
      snapshot = await ctx.addons.installBuiltin(entry.id)
      installed = true
    } else if (entry.source === 'official' || entry.source === 'catalog') {
      const catalogueAddon = catalogueById.get(entry.id)
      if (!catalogueAddon) throw new Error(`Addon pack references an addon outside the official catalogue: ${entry.id}`)
      if (entry.source === 'official' && !String(entry.id).startsWith('elephant.')) {
        throw new Error(`Non-first-party addon cannot use the official source: ${entry.id}`)
      }
      if (!snapshot || snapshot.manifest.version !== catalogueAddon.version) {
        const record = await invokeTauri('tauri_addons_catalog_install', { addonId: entry.id })
        updated = Boolean(snapshot)
        installed = !snapshot
        await registerCatalogRecord(ctx, record)
        snapshot = ctx.addons.get(entry.id)
      }
    } else if (!snapshot) {
      throw new Error(`Addon pack requires locally installed addon ${entry.id}, but it is not available`)
    }

    if (!snapshot) throw new Error(`Unable to register addon from pack: ${entry.id}`)
    const external = snapshot.manifest.source === 'external'
    if (entry.enabled && !snapshot.enabled) {
      await prepareTrustedAddon(ctx, snapshot)
      if (external) await setExternalEnabled(entry.id, true)
      try { await ctx.addons.enable(entry.id) }
      catch (error) {
        if (external) await setExternalEnabled(entry.id, false).catch(() => {})
        throw error
      }
    } else if (!entry.enabled && (snapshot.enabled || snapshot.status === 'error')) {
      if (external) await setExternalEnabled(entry.id, false)
      await ctx.addons.disable(entry.id)
    } else if (!entry.enabled && external) {
      await setExternalEnabled(entry.id, false)
    }

    const current = ctx.addons.get(entry.id) || snapshot
    results.push({
      id: entry.id,
      source: entry.source,
      version: current.manifest.version || entry.version,
      enabled: current.enabled === true,
      installed,
      updated
    })
  }

  const generatedAt = new Date().toISOString()
  const report = [
    '---',
    'title: "Addon Pack Result"',
    'type: "generated-report"',
    'tags: [addons, pack]',
    `generatedAt: ${JSON.stringify(generatedAt)}`,
    '---',
    '',
    '# Addon Pack Result',
    '',
    `Name: ${pack.name}`,
    `Applied: ${generatedAt}`,
    '',
    '| Addon | Source | Version | State | Action |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((result) => {
      const action = result.updated ? 'Updated' : result.installed ? 'Installed' : 'Kept'
      return `| \`${result.id}\` | ${result.source} | ${result.version || 'unknown'} | ${result.enabled ? 'Enabled' : 'Disabled'} | ${action} |`
    }),
    ''
  ].join('\n')
  await writeNote(REPORT_PATH, report)
  return { path: REPORT_PATH, packPath: path, applied: results.length, results }
}

export const addonPacksAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Addon Packs',
    version: '2.0.0',
    description: 'Creates, lists and applies portable packs combining core, official physical and community addons.',
    author: 'Elephant',
    icon: 'layers-3',
    defaultEnabled: true,
    removable: false,
    permissions: ['notes.read', 'notes.write', 'addons.manage'],
    contributes: { actions: true, settings: true }
  },

  activate(ctx) {
    ctx.addAction({
      id: `${ADDON_ID}.ensure-develop-parity`,
      title: 'Create first-party addon packs',
      description: 'Ensure complete and no-calendar first-party physical configurations are available.',
      async run() {
        const result = await ensureDevelopParityPack()
        const base = await ensureBasePack()
        const combined = { ...result, basePackPath: base.packPath, baseCreated: base.created, baseUpdated: base.updated }
        logAction(ctx, 'addon-pack-first-party', combined)
        return combined
      }
    })
    ctx.addAction({
      id: `${ADDON_ID}.create`,
      title: 'Create addon pack from current setup',
      description: `Capture the installed addons and enabled state inside ${PACK_DIRECTORY}.`,
      async run(options = {}) {
        const path = normalizePackPath(options?.path)
        logAction(ctx, 'addon-pack-create:start', { path })
        const result = await createPack(ctx, options)
        logAction(ctx, 'addon-pack-create:done', result)
        return result
      }
    })
    ctx.addAction({
      id: `${ADDON_ID}.apply`,
      title: 'Apply addon pack',
      description: 'Install, update, enable and disable addons from a selected .enaddonpack file.',
      async run(options = {}) {
        const path = normalizePackPath(options?.path)
        logAction(ctx, 'addon-pack-apply:start', { path })
        const result = await applyPack(ctx, options)
        logAction(ctx, 'addon-pack-apply:done', result)
        return result
      }
    })
    ctx.addSettingsSection?.({
      id: `${ADDON_ID}.settings`,
      section: 'addons',
      slot: 'addons.packs',
      chrome: false,
      title: 'Addon packs',
      description: 'Create and apply portable addon configurations.',
      order: 10,
      render: mountSettingsComponent(ctx, AddonPacksSettings)
    })
  }
}

export const addonProfilesAddon = addonPacksAddon

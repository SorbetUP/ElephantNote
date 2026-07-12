import { isTrustedAddonManifest } from '../manifest'
import AddonPacksSettings from './ui/AddonPacksSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'
import { invokeTauri, logAction, notifySuccess, readNote, writeNote } from './shared'

const ADDON_ID = 'elephant.addon-packs'
const PACK_DIRECTORY = '.elephantnote/addons/packs'
const DEFAULT_PACK_PATH = `${PACK_DIRECTORY}/default.enaddonpack`
const DEVELOP_PARITY_PACK_PATH = `${PACK_DIRECTORY}/develop-parity.enaddonpack`
const REPORT_PATH = 'Reports/Addon Pack.md'
const PACK_FORMAT = 'elephantnote-addon-pack'
const PACK_VERSION = 1
const MAX_PACK_ADDONS = 200

const DEVELOP_PARITY_ADDONS = Object.freeze([
  { id: 'elephant.google-keep-import', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.codex-connection', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.calendar', version: '1.1.0', source: 'builtin', enabled: true },
  { id: 'elephant.sites', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.ai', version: '1.1.0', source: 'builtin', enabled: true },
  { id: 'elephant.open-models', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.sync', version: '1.0.0', source: 'builtin', enabled: true },
  { id: 'elephant.code-execution', version: '1.1.0', source: 'builtin', enabled: true },
  { id: 'elephant.excalidraw', version: '1.1.0', source: 'builtin', enabled: true },
  { id: 'elephant.recently-edited', version: '1.0.0', source: 'builtin', enabled: true }
])

const readCommunityEnabled = async () => {
  const value = await invokeTauri('tauri_prefs_get', { key: 'addons.communityEnabled' })
  return value === true
}

const normalizePackPath = (value = DEFAULT_PACK_PATH) => {
  const path = String(value || DEFAULT_PACK_PATH).trim().replaceAll('\\', '/')
  if (!path.startsWith(`${PACK_DIRECTORY}/`) || path.includes('/../') || path.endsWith('/..')) {
    throw new Error(`Addon packs must be stored inside ${PACK_DIRECTORY}`)
  }
  if (!path.toLowerCase().endsWith('.enaddonpack')) {
    throw new Error('Addon pack paths must end with .enaddonpack')
  }
  return path
}

const normalizeSource = (value, fallback = 'builtin') => {
  const source = String(value || fallback).trim().toLowerCase()
  if (!['builtin', 'catalog', 'installed'].includes(source)) {
    throw new Error(`Unsupported addon pack source: ${source}`)
  }
  return source
}

const validatePack = (raw, sourcePath = DEFAULT_PACK_PATH) => {
  let pack
  try {
    pack = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourcePath}: ${error.message}`)
  }
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new Error('Addon pack must be a JSON object')
  }
  if (pack.format !== PACK_FORMAT) {
    throw new Error(`Unsupported addon pack format: ${pack.format || 'missing'}`)
  }
  if (pack.version !== PACK_VERSION) {
    throw new Error(`Unsupported addon pack version: ${pack.version}`)
  }
  if (!Array.isArray(pack.addons)) {
    throw new Error('Addon pack must contain an addons array')
  }
  if (pack.addons.length > MAX_PACK_ADDONS) {
    throw new Error(`Addon pack contains more than ${MAX_PACK_ADDONS} addons`)
  }

  const ids = new Set()
  const addons = pack.addons.map((entry, index) => {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    if (!id) throw new Error(`Addon pack entry ${index + 1} has no id`)
    if (id === ADDON_ID) throw new Error('An addon pack cannot disable or replace the Addon Packs manager itself')
    if (ids.has(id)) throw new Error(`Addon pack contains duplicate id: ${id}`)
    ids.add(id)
    if (typeof entry.enabled !== 'boolean') {
      throw new Error(`Addon pack entry ${id} must define enabled as true or false`)
    }
    return {
      id,
      enabled: entry.enabled,
      source: normalizeSource(entry.source),
      version: typeof entry.version === 'string' ? entry.version.trim() : ''
    }
  })

  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: typeof pack.name === 'string' && pack.name.trim() ? pack.name.trim() : 'Unnamed addon pack',
    description: typeof pack.description === 'string' ? pack.description.trim() : '',
    addons
  }
}

const createDevelopParityPack = () => ({
  format: PACK_FORMAT,
  version: PACK_VERSION,
  name: 'ElephantNote Develop parity',
  description: 'Installs and enables every useful first-party addon to reproduce the complete develop application.',
  createdAt: new Date().toISOString(),
  protected: true,
  addons: DEVELOP_PARITY_ADDONS.map((entry) => ({ ...entry }))
})

const isDevelopParityCurrent = (pack) => {
  if (!pack || pack.addons.length !== DEVELOP_PARITY_ADDONS.length) return false
  const entries = new Map(pack.addons.map((entry) => [entry.id, entry]))
  return DEVELOP_PARITY_ADDONS.every((expected) => {
    const entry = entries.get(expected.id)
    return entry && entry.source === expected.source && entry.version === expected.version && entry.enabled === true
  })
}

const ensureDevelopParityPack = async () => {
  try {
    const existing = await readNote(DEVELOP_PARITY_PACK_PATH)
    const parsed = validatePack(existing.content, DEVELOP_PARITY_PACK_PATH)
    if (isDevelopParityCurrent(parsed)) {
      return { packPath: DEVELOP_PARITY_PACK_PATH, created: false, updated: false }
    }
  } catch {
    // Missing, invalid or stale protected packs are regenerated below.
  }
  const pack = createDevelopParityPack()
  await writeNote(DEVELOP_PARITY_PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`)
  return { packPath: DEVELOP_PARITY_PACK_PATH, created: true, updated: true, pack }
}

const createPack = async (ctx, options = {}) => {
  const path = normalizePackPath(options?.path)
  const catalogue = await invokeTauri('tauri_addons_catalog_list')
  const catalogueById = new Map((Array.isArray(catalogue) ? catalogue : []).map((addon) => [addon.id, addon]))
  const addons = ctx.addons.list()
    .filter((addon) => addon?.manifest?.id && addon.manifest.id !== ADDON_ID)
    .map((addon) => {
      const external = addon.manifest.source === 'external'
      const catalogued = catalogueById.has(addon.manifest.id)
      return {
        id: addon.manifest.id,
        version: addon.manifest.version || '',
        source: external ? (catalogued ? 'catalog' : 'installed') : 'builtin',
        enabled: addon.enabled === true
      }
    })
    .sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id))

  const pack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: typeof options?.name === 'string' && options.name.trim() ? options.name.trim() : 'Default ElephantNote pack',
    description: typeof options?.description === 'string'
      ? options.description.trim()
      : 'A portable set of installed built-in and community addons with their enabled state.',
    createdAt: new Date().toISOString(),
    addons
  }
  await writeNote(path, `${JSON.stringify(pack, null, 2)}\n`)
  return { path, count: addons.length, pack }
}

const registerCatalogRecord = async (ctx, record) => {
  const manager = ctx.addons
  const external = manager.external
  if (!external) throw new Error('The community addon runtime is not available')
  const current = manager.get(record.manifest.id)
  const rawManager = external.manager || ctx.addonHost?.get?.('addonManager')
  if (!rawManager) throw new Error('The addon manager is unavailable')
  if (current) {
    if (current.enabled || current.status === 'error') await manager.disable(record.manifest.id).catch(() => {})
    rawManager.unregister(record.manifest.id)
  }
  external.register(record)
}

const prepareTrustedAddon = async (ctx, snapshot) => {
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
  const requiresCommunity = pack.addons.some((entry) => entry.enabled && entry.source !== 'builtin')
  if (requiresCommunity && !await readCommunityEnabled()) {
    throw new Error('Turn on Community Addons in Settings before applying a pack that enables third-party addons')
  }

  const results = []
  for (const entry of pack.addons) {
    let snapshot = ctx.addons.get(entry.id)
    let installed = false
    let updated = false

    if (entry.source === 'builtin' && !snapshot) {
      snapshot = await ctx.addons.installBuiltin(entry.id)
      installed = true
    } else if (entry.source === 'catalog') {
      const catalogueAddon = catalogueById.get(entry.id)
      if (!catalogueAddon) throw new Error(`Addon pack references an addon outside the official catalogue: ${entry.id}`)
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
      try {
        await ctx.addons.enable(entry.id)
      } catch (error) {
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
    `Pack: \`${path}\``,
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
    version: '1.2.0',
    description: 'Creates, lists and applies portable addon packs that configure built-in and community addons together.',
    author: 'ElephantNote',
    icon: 'layers-3',
    defaultEnabled: true,
    removable: false,
    permissions: ['notes.read', 'notes.write', 'addons.manage'],
    contributes: { actions: true, settings: true }
  },

  activate(ctx) {
    ctx.addAction({
      id: `${ADDON_ID}.ensure-develop-parity`,
      title: 'Create Develop parity pack',
      description: 'Ensure the complete first-party ElephantNote configuration is available as an addon pack.',
      async run() {
        const result = await ensureDevelopParityPack()
        logAction(ctx, 'addon-pack-develop-parity', result)
        return result
      }
    })

    ctx.addAction({
      id: `${ADDON_ID}.create`,
      title: 'Create addon pack from current setup',
      description: `Capture the installed addons and their enabled state inside ${PACK_DIRECTORY}.`,
      async run(options = {}) {
        const path = normalizePackPath(options?.path)
        logAction(ctx, 'addon-pack-create:start', { path })
        const result = await createPack(ctx, options)
        notifySuccess(`Addon pack created: ${result.path}`)
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
        notifySuccess(`Addon pack applied: ${result.applied} addons`)
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

// Compatibility export for code and tests that still import the previous symbol.
export const addonProfilesAddon = addonPacksAddon

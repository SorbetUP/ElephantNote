import { isTrustedAddonManifest } from '../manifest'
import { invokeTauri, logAction, notifySuccess, readNote, writeNote } from './shared'

const ADDON_ID = 'elephant.addon-packs'
const PACK_PATH = '.elephantnote/addons/packs/default.enaddonpack'
const REPORT_PATH = 'Reports/Addon Pack.md'
const PACK_FORMAT = 'elephantnote-addon-pack'
const PACK_VERSION = 1
const MAX_PACK_ADDONS = 200

const readCommunityEnabled = async () => {
  const value = await invokeTauri('tauri_prefs_get', { key: 'addons.communityEnabled' })
  return value === true
}

const normalizeSource = (value, fallback = 'builtin') => {
  const source = String(value || fallback).trim().toLowerCase()
  if (!['builtin', 'catalog', 'installed'].includes(source)) {
    throw new Error(`Unsupported addon pack source: ${source}`)
  }
  return source
}

const validatePack = (raw) => {
  let pack
  try {
    pack = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON in ${PACK_PATH}: ${error.message}`)
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

const createPack = async (ctx) => {
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
    name: 'Default ElephantNote pack',
    description: 'A portable set of built-in and community addons with their enabled state.',
    createdAt: new Date().toISOString(),
    addons
  }
  await writeNote(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`)
  return { path: PACK_PATH, count: addons.length, pack }
}

const replaceRegisteredAddon = async (manager, record) => {
  const external = manager.external
  if (!external) throw new Error('The community addon runtime is not available')
  const current = manager.get(record.manifest.id)
  if (current) {
    if (current.enabled || current.status === 'error') {
      await manager.disable(record.manifest.id).catch(() => {})
    }
    manager.current?.unregister?.(record.manifest.id)
  }
  return external.register(record)
}

const registerCatalogRecord = async (ctx, record) => {
  const manager = ctx.addons
  const external = manager.external
  if (!external) throw new Error('The community addon runtime is not available')
  const current = manager.get(record.manifest.id)
  if (current) {
    if (current.enabled || current.status === 'error') await manager.disable(record.manifest.id).catch(() => {})
    const rawManager = ctx.addonHost?.get?.('addonManager')
    rawManager?.unregister?.(record.manifest.id)
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

const applyPack = async (ctx) => {
  const note = await readNote(PACK_PATH)
  const pack = validatePack(note.content)
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

    if (entry.source === 'catalog') {
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
      const qualifier = entry.source === 'builtin' ? 'built-in addon' : 'locally installed addon'
      throw new Error(`Addon pack requires ${qualifier} ${entry.id}, but it is not available`)
    }

    if (!snapshot) throw new Error(`Unable to register addon from pack: ${entry.id}`)
    if (entry.enabled && !snapshot.enabled) {
      await prepareTrustedAddon(ctx, snapshot)
      await ctx.addons.enable(entry.id)
    } else if (!entry.enabled && (snapshot.enabled || snapshot.status === 'error')) {
      await ctx.addons.disable(entry.id)
    }

    results.push({
      id: entry.id,
      source: entry.source,
      version: snapshot.manifest.version || entry.version,
      enabled: entry.enabled,
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
    `Pack: \`${PACK_PATH}\``,
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
  return { path: REPORT_PATH, packPath: PACK_PATH, applied: results.length, results }
}

export const addonPacksAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Addon Packs',
    version: '1.0.0',
    description: 'Creates and applies portable addon packs that configure built-in and community addons together.',
    author: 'ElephantNote',
    defaultEnabled: true,
    permissions: ['notes.read', 'notes.write', 'addons.manage'],
    contributes: { actions: true }
  },

  activate(ctx) {
    ctx.addAction({
      id: `${ADDON_ID}.create`,
      title: 'Create addon pack from current setup',
      description: `Capture the installed addons and their enabled state in ${PACK_PATH}.`,
      async run() {
        logAction(ctx, 'addon-pack-create:start', { path: PACK_PATH })
        const result = await createPack(ctx)
        notifySuccess(`Addon pack created: ${PACK_PATH}`)
        logAction(ctx, 'addon-pack-create:done', result)
        return result
      }
    })

    ctx.addAction({
      id: `${ADDON_ID}.apply`,
      title: 'Apply default addon pack',
      description: `Install, update, enable and disable addons from ${PACK_PATH}.`,
      async run() {
        logAction(ctx, 'addon-pack-apply:start', { path: PACK_PATH })
        const result = await applyPack(ctx)
        notifySuccess(`Addon pack applied: ${result.applied} addons`)
        logAction(ctx, 'addon-pack-apply:done', result)
        return result
      }
    })
  }
}

// Compatibility export for code and tests that still import the previous symbol.
export const addonProfilesAddon = addonPacksAddon

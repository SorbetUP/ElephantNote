import { invokeTauri, logAction, notifySuccess, readNote, writeNote } from './shared'

const PROFILE_PATH = 'Addon Profiles/default.json'
const REPORT_PATH = 'Reports/Addon Profile.md'
const PROFILE_VERSION = 1
const MAX_PROFILE_ADDONS = 100

const readCommunityEnabled = async () => {
  const value = await invokeTauri('tauri_prefs_get', { key: 'addons.communityEnabled' })
  return value === true
}

const validateProfile = (raw) => {
  let profile
  try {
    profile = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON in ${PROFILE_PATH}: ${error.message}`)
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Addon profile must be a JSON object')
  }
  if (profile.version !== PROFILE_VERSION) {
    throw new Error(`Unsupported addon profile version: ${profile.version}`)
  }
  if (!Array.isArray(profile.addons)) {
    throw new Error('Addon profile must contain an addons array')
  }
  if (profile.addons.length > MAX_PROFILE_ADDONS) {
    throw new Error(`Addon profile contains more than ${MAX_PROFILE_ADDONS} addons`)
  }

  const ids = new Set()
  const addons = profile.addons.map((entry, index) => {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    if (!id) throw new Error(`Addon profile entry ${index + 1} has no id`)
    if (ids.has(id)) throw new Error(`Addon profile contains duplicate id: ${id}`)
    ids.add(id)
    if (typeof entry.enabled !== 'boolean') {
      throw new Error(`Addon profile entry ${id} must define enabled as true or false`)
    }
    return { id, enabled: entry.enabled }
  })

  return { version: PROFILE_VERSION, addons }
}

const createTemplate = async () => {
  const catalogue = await invokeTauri('tauri_addons_catalog_list')
  const template = {
    version: PROFILE_VERSION,
    addons: (Array.isArray(catalogue) ? catalogue : []).map((addon, index) => ({
      id: addon.id,
      enabled: index < 2
    }))
  }
  await writeNote(PROFILE_PATH, `${JSON.stringify(template, null, 2)}\n`)
  return { path: PROFILE_PATH, count: template.addons.length }
}

const replaceRegisteredAddon = async (manager, record) => {
  const current = manager.get(record.manifest.id)
  if (current) {
    if (current.enabled || current.status === 'error') {
      await manager.disable(record.manifest.id).catch(() => {})
    }
    manager.unregister(record.manifest.id)
  }
  manager.external.register(record)
}

const applyProfile = async (ctx) => {
  if (!ctx.addons?.external) {
    throw new Error('The community addon runtime is not available')
  }
  const note = await readNote(PROFILE_PATH)
  const profile = validateProfile(note.content)
  const catalogue = await invokeTauri('tauri_addons_catalog_list')
  const catalogueById = new Map((Array.isArray(catalogue) ? catalogue : []).map((addon) => [addon.id, addon]))
  const unknown = profile.addons.filter((entry) => !catalogueById.has(entry.id)).map((entry) => entry.id)
  if (unknown.length) {
    throw new Error(`Profile references addons outside the official catalogue: ${unknown.join(', ')}`)
  }
  if (profile.addons.some((entry) => entry.enabled) && !await readCommunityEnabled()) {
    throw new Error('Turn on Community Addons in Settings before applying a profile that enables addons')
  }

  const results = []
  for (const entry of profile.addons) {
    const catalogueAddon = catalogueById.get(entry.id)
    let snapshot = ctx.addons.get(entry.id)
    let installed = false
    let updated = false

    if (!snapshot || snapshot.manifest.version !== catalogueAddon.version) {
      const record = await invokeTauri('tauri_addons_catalog_install', { addonId: entry.id })
      updated = Boolean(snapshot)
      installed = !snapshot
      await replaceRegisteredAddon(ctx.addons, record)
      snapshot = ctx.addons.get(entry.id)
    }

    if (entry.enabled && !snapshot.enabled) {
      await ctx.addons.enable(entry.id)
    } else if (!entry.enabled && (snapshot.enabled || snapshot.status === 'error')) {
      await ctx.addons.disable(entry.id)
    }

    results.push({
      id: entry.id,
      version: catalogueAddon.version,
      enabled: entry.enabled,
      installed,
      updated
    })
  }

  const generatedAt = new Date().toISOString()
  const report = [
    '---',
    'title: "Addon Profile Result"',
    'type: "generated-report"',
    'tags: [addons, profile]',
    `generatedAt: ${JSON.stringify(generatedAt)}`,
    '---',
    '',
    '# Addon Profile Result',
    '',
    `Profile: \`${PROFILE_PATH}\``,
    `Applied: ${generatedAt}`,
    '',
    '| Addon | Version | State | Action |',
    '| --- | --- | --- | --- |',
    ...results.map((result) => {
      const action = result.updated ? 'Updated' : result.installed ? 'Installed' : 'Kept'
      return `| \`${result.id}\` | ${result.version} | ${result.enabled ? 'Enabled' : 'Disabled'} | ${action} |`
    }),
    ''
  ].join('\n')
  await writeNote(REPORT_PATH, report)
  return { path: REPORT_PATH, applied: results.length, results }
}

export const addonProfilesAddon = {
  manifest: {
    id: 'elephant.addon-profiles',
    name: 'Addon Profiles',
    version: '1.0.0',
    description: 'Creates and applies a versioned JSON profile for official community addons.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: ['notes.read', 'notes.write', 'addons.manage'],
    contributes: {
      actions: true,
      settings: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.addon-profiles.create-template',
      title: 'Create addon profile template',
      description: `Create ${PROFILE_PATH} from the current official catalogue.`,
      async run() {
        logAction(ctx, 'addon-profile-template:start', { path: PROFILE_PATH })
        const result = await createTemplate()
        notifySuccess(`Addon profile template created: ${PROFILE_PATH}`)
        logAction(ctx, 'addon-profile-template:done', result)
        return result
      }
    })

    ctx.addAction({
      id: 'elephant.addon-profiles.apply',
      title: 'Apply addon profile',
      description: `Install, update, enable and disable official addons from ${PROFILE_PATH}.`,
      async run() {
        logAction(ctx, 'addon-profile-apply:start', { path: PROFILE_PATH })
        const result = await applyProfile(ctx)
        notifySuccess(`Addon profile applied: ${result.applied} entries`)
        logAction(ctx, 'addon-profile-apply:done', result)
        return result
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.addon-profiles.settings',
      title: 'Addon Profiles',
      description: `Edit ${PROFILE_PATH}, then run Apply addon profile. Only official catalogue addons are accepted.`,
      order: 130
    })
  }
}

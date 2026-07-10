import { afterEach, describe, expect, it, vi } from 'vitest'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { success } }))

import { addonProfilesAddon } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js'

const catalog = [
  { id: 'com.example.alpha', name: 'Alpha', version: '1.0.0' },
  { id: 'com.example.beta', name: 'Beta', version: '2.0.0' }
]

const createManager = () => {
  const records = new Map()
  const manager = {
    external: {
      register(record) {
        records.set(record.manifest.id, {
          manifest: { ...record.manifest, source: 'external' },
          enabled: false,
          status: 'disabled'
        })
      }
    },
    get: (id) => records.get(id) || null,
    async enable(id) {
      const record = records.get(id)
      record.enabled = true
      record.status = 'enabled'
      return record
    },
    async disable(id) {
      const record = records.get(id)
      if (record) {
        record.enabled = false
        record.status = 'disabled'
      }
      return record
    },
    unregister(id) { records.delete(id) }
  }
  return { manager, records }
}

const activateActions = (manager) => {
  const actions = new Map()
  addonProfilesAddon.activate({
    addons: manager,
    logger: { info: vi.fn() },
    addAction(action) { actions.set(action.id, action) },
    addSettingsSection: vi.fn()
  })
  return actions
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Addon Profiles built-in', () => {
  it('creates a profile then installs and applies official catalogue addons', async () => {
    const files = new Map()
    const { manager, records } = createManager()
    const invoke = vi.fn(async (command, payload = {}) => {
      if (command === 'tauri_addons_catalog_list') return catalog
      if (command === 'tauri_prefs_get') return true
      if (command === 'tauri_notes_write') {
        files.set(payload.relativePath, payload.content)
        return { ok: true, path: payload.relativePath }
      }
      if (command === 'tauri_notes_read') {
        if (!files.has(payload.relativePath)) throw new Error('not found')
        return { path: payload.relativePath, content: files.get(payload.relativePath) }
      }
      if (command === 'tauri_addons_catalog_install') {
        const addon = catalog.find((entry) => entry.id === payload.addonId)
        return {
          manifest: {
            id: addon.id,
            name: addon.name,
            version: addon.version,
            permissions: {},
            runtime: { type: 'javascript-worker', entry: 'main.js' }
          },
          enabled: false,
          packageHash: 'hash',
          installedAt: '2026-07-10T00:00:00Z',
          source: 'catalog'
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const actions = activateActions(manager)
    const template = await actions.get('elephant.addon-profiles.create-template').run()
    expect(template.count).toBe(2)
    expect(JSON.parse(files.get(template.path)).addons).toHaveLength(2)

    files.set('Addon Profiles/default.json', JSON.stringify({
      version: 1,
      addons: [
        { id: 'com.example.alpha', enabled: true },
        { id: 'com.example.beta', enabled: false }
      ]
    }))
    const result = await actions.get('elephant.addon-profiles.apply').run()

    expect(result.applied).toBe(2)
    expect(records.get('com.example.alpha').enabled).toBe(true)
    expect(records.get('com.example.beta').enabled).toBe(false)
    expect(files.get('Reports/Addon Profile.md')).toContain('| `com.example.alpha` | 1.0.0 | Enabled | Installed |')
  })

  it('rejects addon ids that are not in the official catalogue', async () => {
    const { manager } = createManager()
    const invoke = vi.fn(async (command, payload = {}) => {
      if (command === 'tauri_addons_catalog_list') return catalog
      if (command === 'tauri_notes_read') {
        return { path: payload.relativePath, content: JSON.stringify({ version: 1, addons: [{ id: 'unknown.addon', enabled: true }] }) }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const actions = activateActions(manager)
    await expect(actions.get('elephant.addon-profiles.apply').run()).rejects.toThrow('outside the official catalogue')
  })
})

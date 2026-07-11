import { afterEach, describe, expect, it, vi } from 'vitest'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { success } }))

import { addonPacksAddon } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js'

const PACK_PATH = '.elephantnote/addons/packs/default.enaddonpack'
const REPORT_PATH = 'Reports/Addon Pack.md'
const catalog = [
  { id: 'com.example.alpha', name: 'Alpha', version: '1.0.0' },
  { id: 'com.example.beta', name: 'Beta', version: '2.0.0' }
]

const snapshot = (id, options = {}) => ({
  manifest: {
    id,
    name: options.name || id,
    version: options.version || '1.0.0',
    source: options.source || 'external',
    permissions: {},
    runtime: { type: 'javascript-worker', entry: 'main.js' }
  },
  enabled: options.enabled === true,
  status: options.enabled === true ? 'enabled' : 'disabled'
})

const createManager = (initial = []) => {
  const records = new Map(initial.map((record) => [record.manifest.id, record]))
  const manager = {
    list: () => [...records.values()],
    get: (id) => records.get(id) || null,
    async enable(id) {
      const record = records.get(id)
      if (!record) throw new Error(`Unknown addon: ${id}`)
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
  manager.external = {
    manager,
    register(record) {
      records.set(record.manifest.id, {
        manifest: { ...record.manifest, source: 'external' },
        enabled: record.enabled === true,
        status: record.enabled === true ? 'enabled' : 'disabled'
      })
    },
    setSafeMode: vi.fn(async () => false),
    approveTrusted: vi.fn(async () => ({ approved: true }))
  }
  return { manager, records }
}

const activateActions = (manager) => {
  const actions = new Map()
  addonPacksAddon.activate({
    addons: manager,
    addonHost: { get: (key) => key === 'addonManager' ? manager : null },
    logger: { info: vi.fn() },
    addAction(action) { actions.set(action.id, action) }
  })
  return actions
}

const createInvoke = (files) => vi.fn(async (command, payload = {}) => {
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
    if (!addon) throw new Error(`Unknown catalogue addon: ${payload.addonId}`)
    return {
      manifest: {
        id: addon.id,
        name: addon.name,
        version: addon.version,
        permissions: {},
        runtime: { type: 'javascript-worker', entry: 'main.js' }
      },
      enabled: false,
      packageHash: `hash-${addon.id}`,
      installedAt: '2026-07-10T00:00:00Z',
      source: 'catalog'
    }
  }
  throw new Error(`Unexpected command: ${command}`)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Addon Packs built-in', () => {
  it('captures the current setup then installs and applies a portable pack', async () => {
    const files = new Map()
    const { manager, records } = createManager([
      snapshot('com.example.alpha', { name: 'Alpha', version: '1.0.0', enabled: true }),
      snapshot('elephant.calendar', { source: 'builtin', enabled: false })
    ])
    vi.stubGlobal('__TAURI__', { core: { invoke: createInvoke(files) } })

    const actions = activateActions(manager)
    const created = await actions.get('elephant.addon-packs.create').run()

    expect(created.path).toBe(PACK_PATH)
    expect(created.count).toBe(2)
    const exported = JSON.parse(files.get(PACK_PATH))
    expect(exported).toMatchObject({ format: 'elephantnote-addon-pack', version: 1 })
    expect(exported.addons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'com.example.alpha', source: 'catalog', enabled: true }),
      expect.objectContaining({ id: 'elephant.calendar', source: 'builtin', enabled: false })
    ]))

    files.set(PACK_PATH, JSON.stringify({
      format: 'elephantnote-addon-pack',
      version: 1,
      name: 'Test setup',
      addons: [
        { id: 'com.example.alpha', source: 'catalog', version: '1.0.0', enabled: false },
        { id: 'com.example.beta', source: 'catalog', version: '2.0.0', enabled: true },
        { id: 'elephant.calendar', source: 'builtin', version: '1.0.0', enabled: true }
      ]
    }))

    const result = await actions.get('elephant.addon-packs.apply').run()

    expect(result.applied).toBe(3)
    expect(records.get('com.example.alpha').enabled).toBe(false)
    expect(records.get('com.example.beta').enabled).toBe(true)
    expect(records.get('elephant.calendar').enabled).toBe(true)
    expect(files.get(REPORT_PATH)).toContain('| `com.example.beta` | catalog | 2.0.0 | Enabled | Installed |')
  })

  it('rejects catalogue entries that are not in the official catalogue', async () => {
    const files = new Map([[PACK_PATH, JSON.stringify({
      format: 'elephantnote-addon-pack',
      version: 1,
      addons: [{ id: 'unknown.addon', source: 'catalog', enabled: true }]
    })]])
    const { manager } = createManager()
    vi.stubGlobal('__TAURI__', { core: { invoke: createInvoke(files) } })

    const actions = activateActions(manager)
    await expect(actions.get('elephant.addon-packs.apply').run()).rejects.toThrow('outside the official catalogue')
  })
})

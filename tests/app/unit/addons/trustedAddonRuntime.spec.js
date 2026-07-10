import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  approveTrustedAddon,
  createTrustedAddonApi,
  getTrustedApproval,
  getTrustedSafeMode,
  isTrustedExternalManifest,
  revokeTrustedAddon,
  setTrustedSafeMode
} from '../../../../Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js'
import {
  ADDON_ACCESS_LEVEL,
  getAddonAccessLevel,
  normalizeAddonManifest
} from '../../../../Elephant/frontend/src/renderer/src/addons/manifest.js'

const createPreferenceTarget = () => {
  const preferences = new Map()
  const local = new Map()
  return {
    preferences,
    target: {
      localStorage: {
        getItem: (key) => local.get(key) ?? null,
        setItem: (key, value) => local.set(key, String(value))
      },
      __TAURI__: {
        core: {
          invoke: vi.fn(async (command, payload) => {
            if (command === 'tauri_prefs_get') return preferences.get(payload.key) ?? null
            if (command === 'tauri_prefs_set') {
              preferences.set(payload.key, payload.value)
              return { ok: true }
            }
            throw new Error(`Unexpected command: ${command}`)
          })
        }
      }
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trusted addon manifest model', () => {
  it('keeps legacy isolated addons and recognizes explicit full app access', () => {
    const isolated = normalizeAddonManifest({
      id: 'com.example.isolated',
      name: 'Isolated',
      version: '1.0.0',
      source: 'external',
      runtime: { type: 'javascript-worker', entry: 'main.js' }
    })
    const trusted = normalizeAddonManifest({
      id: 'com.example.trusted',
      name: 'Trusted',
      version: '1.0.0',
      source: 'external',
      runtime: { type: 'javascript-worker', entry: 'main.js' },
      contributes: { runtimeMode: 'trusted' }
    })

    expect(getAddonAccessLevel(isolated)).toBe(ADDON_ACCESS_LEVEL.isolated)
    expect(getAddonAccessLevel(trusted)).toBe(ADDON_ACCESS_LEVEL.trusted)
    expect(isTrustedExternalManifest(trusted)).toBe(true)
  })

  it('treats builtin addons as system addons', () => {
    const manifest = normalizeAddonManifest({
      id: 'elephant.system-test',
      name: 'System test',
      version: '1.0.0'
    })
    expect(getAddonAccessLevel(manifest)).toBe(ADDON_ACCESS_LEVEL.system)
  })
})

describe('hash-bound trusted approval', () => {
  it('requires approval again when the package hash changes', async () => {
    const { target } = createPreferenceTarget()
    const first = {
      manifest: { id: 'com.example.trusted' },
      packageHash: 'hash-v1'
    }
    const updated = {
      manifest: { id: 'com.example.trusted' },
      packageHash: 'hash-v2'
    }

    expect((await getTrustedApproval(first, target)).approved).toBe(false)
    expect((await approveTrustedAddon(first, target)).approved).toBe(true)
    expect((await getTrustedApproval(first, target)).approved).toBe(true)
    expect((await getTrustedApproval(updated, target)).approved).toBe(false)
    expect((await revokeTrustedAddon(first, target)).approved).toBe(false)
  })

  it('persists emergency safe mode independently of addon packages', async () => {
    const { target } = createPreferenceTarget()
    expect(await getTrustedSafeMode(target)).toBe(false)
    await setTrustedSafeMode(true, target)
    expect(await getTrustedSafeMode(target)).toBe(true)
    await setTrustedSafeMode(false, target)
    expect(await getTrustedSafeMode(target)).toBe(false)
  })
})

describe('trusted addon host API', () => {
  it('exposes deep application context and registers automatic cleanup', () => {
    const removed = vi.fn()
    const appended = []
    const fakeDocument = {
      head: { appendChild: (node) => appended.push(node) },
      createElement: () => ({
        dataset: {},
        textContent: '',
        remove: removed
      })
    }
    const contributions = []
    const contextDisposables = []
    const context = {
      router: { currentRoute: {} },
      pinia: { state: {} },
      services: { example: true },
      runtime: 'tauri',
      addons: { list: vi.fn() },
      vueApp: { component: vi.fn() },
      registerContribution: vi.fn((area, contribution) => {
        contributions.push({ area, contribution })
        return vi.fn()
      }),
      addAction: vi.fn(),
      addView: vi.fn(),
      addSidebarItem: vi.fn(),
      addSettingsSection: vi.fn(),
      addEditorExtension: vi.fn(),
      addStatusBarItem: vi.fn(),
      addDisposable: (dispose) => contextDisposables.push(dispose)
    }
    const target = { document: fakeDocument }
    const record = {
      manifest: { id: 'com.example.trusted', permissions: {} },
      packageHash: 'abc123'
    }
    const sessionDisposables = []

    const api = createTrustedAddonApi(record, context, sessionDisposables, target)
    api.ui.registerStyle('.test { display: none; }', 'test')
    api.editor.registerBlockType({ id: 'com.example.trusted.block' })
    api.markdown.registerEmbedRenderer({ id: 'com.example.trusted.embed' })
    api.layout.registerItem({ id: 'com.example.trusted.layout' })

    expect(api.access.level).toBe('trusted')
    expect(api.app.router).toBe(context.router)
    expect(api.experimental.services).toBe(context.services)
    expect(appended).toHaveLength(1)
    expect(contributions.map((entry) => entry.area)).toEqual([
      'editor.block-types',
      'markdown.embed-renderers',
      'layout.items'
    ])
    expect(contextDisposables.length).toBeGreaterThan(0)

    for (const dispose of [...contextDisposables].reverse()) dispose()
    expect(removed).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { useAddonsStore } from '@/store/addons'

const createAddon = () => ({
  manifest: {
    id: 'store.addon',
    name: 'Store Addon'
  },
  activate: vi.fn((ctx) => {
    ctx.addSidebarItem({ id: 'store-sidebar', title: 'Store Sidebar' })
  }),
  deactivate: vi.fn()
})

describe('useAddonsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mirrors registered addon state from the manager', () => {
    const manager = new ElephantAddonManager()
    manager.register(createAddon())

    const store = useAddonsStore()
    store.install(manager)

    expect(store.installed).toBe(true)
    expect(store.items).toHaveLength(1)
    expect(store.items[0].manifest.id).toBe('store.addon')
  })

  it('updates when an addon is enabled and contributes UI entries', async () => {
    const manager = new ElephantAddonManager()
    manager.register(createAddon())

    const store = useAddonsStore()
    store.install(manager)
    await store.enableAddon('store.addon')

    expect(store.enabledAddons).toHaveLength(1)
    expect(store.contributionCount).toBe(1)
    expect(store.getContributions(ADDON_EXTENSION_POINTS.sidebarItems)).toEqual([
      {
        addonId: 'store.addon',
        contribution: { id: 'store-sidebar', title: 'Store Sidebar' }
      }
    ])
  })

  it('removes contributions when an addon is disabled', async () => {
    const manager = new ElephantAddonManager()
    manager.register(createAddon())

    const store = useAddonsStore()
    store.install(manager)
    await store.enableAddon('store.addon')
    await store.disableAddon('store.addon')

    expect(store.enabledAddons).toHaveLength(0)
    expect(store.contributionCount).toBe(0)
  })

  it('cleans event listeners when uninstalled', () => {
    const manager = new ElephantAddonManager()
    const store = useAddonsStore()

    store.install(manager)
    expect(store.disposeListeners.length).toBeGreaterThan(0)

    store.uninstall()
    expect(store.installed).toBe(false)
    expect(store.disposeListeners).toEqual([])
  })
})

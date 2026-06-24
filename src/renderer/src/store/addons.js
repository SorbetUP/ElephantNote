import { defineStore } from 'pinia'
import { markRaw } from 'vue'

const ADDON_STORE_EVENTS = [
  'registered',
  'changed',
  'enabled',
  'disabled',
  'error',
  'contribution:changed'
]

const cloneContributionMap = (map = {}) => {
  return Object.fromEntries(
    Object.entries(map).map(([area, entries]) => [area, Array.isArray(entries) ? [...entries] : []])
  )
}

export const useAddonsStore = defineStore('addons', {
  state: () => ({
    installed: false,
    items: [],
    contributions: {},
    lastError: null,
    manager: null,
    disposeListeners: []
  }),

  getters: {
    enabledAddons: (state) => state.items.filter((item) => item.enabled),
    failedAddons: (state) => state.items.filter((item) => item.status === 'error'),
    contributionCount: (state) => Object.values(state.contributions).reduce(
      (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
      0
    ),
    getContributions: (state) => (area) => [...(state.contributions[area] || [])]
  },

  actions: {
    install(manager) {
      if (!manager) throw new TypeError('Addon manager is required')
      this.uninstall()
      this.manager = markRaw(manager)
      this.installed = true
      this.refresh()

      const refresh = () => this.refresh()
      this.disposeListeners = ADDON_STORE_EVENTS.map((eventName) => manager.on(eventName, refresh))
    },

    uninstall() {
      for (const dispose of this.disposeListeners) {
        try {
          dispose()
        } catch {
          // Ignore listener cleanup errors; this store is only a UI mirror.
        }
      }
      this.disposeListeners = []
      this.manager = null
      this.installed = false
      this.items = []
      this.contributions = {}
      this.lastError = null
    },

    refresh() {
      if (!this.manager) return
      this.items = this.manager.list()
      this.contributions = cloneContributionMap(this.manager.getContributionMap())
    },

    async enableAddon(id) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      try {
        await this.manager.enable(id)
        this.lastError = null
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.refresh()
      }
    },

    async disableAddon(id) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      try {
        await this.manager.disable(id)
        this.lastError = null
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.refresh()
      }
    },

    async setAddonEnabled(id, enabled) {
      if (enabled) {
        await this.enableAddon(id)
      } else {
        await this.disableAddon(id)
      }
    }
  }
})

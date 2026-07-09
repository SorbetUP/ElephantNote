import { defineStore } from 'pinia'
import { markRaw } from 'vue'

const COMMUNITY_ADDONS_PREF_KEY = 'addons.communityEnabled'

const ADDON_STORE_EVENTS = [
  'registered',
  'unregistered',
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

const invokeTauri = (command, payload = {}) => {
  const invoke = globalThis?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return invoke(command, payload)
}

const setExternalRegistryEnabled = (id, enabled) => {
  return invokeTauri('tauri_addons_set_enabled', { addonId: id, enabled })
}

const readCommunityAddonsEnabled = async () => {
  const value = await invokeTauri('tauri_prefs_get', { key: COMMUNITY_ADDONS_PREF_KEY })
  return value === true
}

const persistCommunityAddonsEnabled = (enabled) => {
  return invokeTauri('tauri_prefs_set', { key: COMMUNITY_ADDONS_PREF_KEY, value: enabled === true })
}

const parentDirectory = (relativePath = '') => {
  const parts = String(relativePath || '').split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

const refreshVaultAfterAddonAction = async (result, logger) => {
  const relativePath = typeof result?.path === 'string' ? result.path : ''
  if (!relativePath) return

  const [{ useVaultStore }, { elephantnoteClient }] = await Promise.all([
    import('elephant-front/stores/vaultStore'),
    import('elephant-front/services/elephantnoteClient')
  ])
  const vaultStore = useVaultStore()
  if (!vaultStore.activeVault?.path) return

  const targetDirectory = parentDirectory(relativePath)
  logger?.info?.('[addons] vault-refresh:start', {
    path: relativePath,
    targetDirectory,
    currentDirectory: vaultStore.currentPath || ''
  })

  const rootEntries = await elephantnoteClient.directory.list('')
  vaultStore.rootEntries = rootEntries

  if (vaultStore.currentPath) {
    vaultStore.entries = await elephantnoteClient.directory.list(vaultStore.currentPath)
  } else {
    vaultStore.entries = rootEntries
  }

  const targetEntries = targetDirectory === vaultStore.currentPath
    ? vaultStore.entries
    : targetDirectory
      ? await elephantnoteClient.directory.list(targetDirectory)
      : rootEntries
  const createdEntry = targetEntries.find((entry) => entry?.path === relativePath)

  if (createdEntry) {
    vaultStore.openNote(createdEntry)
  }

  logger?.info?.('[addons] vault-refresh:done', {
    path: relativePath,
    found: Boolean(createdEntry),
    rootEntries: rootEntries.length
  })
}

export const useAddonsStore = defineStore('addons', {
  state: () => ({
    installed: false,
    items: [],
    contributions: {},
    lastError: null,
    operationInProgress: false,
    communityAddonsEnabled: false,
    communityConsentLoaded: false,
    manager: null,
    disposeListeners: []
  }),

  getters: {
    enabledAddons: (state) => state.items.filter((item) => item.enabled),
    externalAddons: (state) => state.items.filter((item) => item.manifest.source === 'external'),
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
      void this.loadCommunityAddonsConsent()

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
      this.operationInProgress = false
      this.communityAddonsEnabled = false
      this.communityConsentLoaded = false
    },

    refresh() {
      if (!this.manager) return
      this.items = this.manager.list()
      this.contributions = cloneContributionMap(this.manager.getContributionMap())
    },

    async loadCommunityAddonsConsent() {
      try {
        this.communityAddonsEnabled = await readCommunityAddonsEnabled()
        this.lastError = null
      } catch (error) {
        this.communityAddonsEnabled = false
        this.lastError = error?.message || String(error)
      } finally {
        this.communityConsentLoaded = true
      }
      return this.communityAddonsEnabled
    },

    async setCommunityAddonsEnabled(enabled) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      this.operationInProgress = true
      try {
        const nextEnabled = enabled === true
        await persistCommunityAddonsEnabled(nextEnabled)
        this.communityAddonsEnabled = nextEnabled
        this.communityConsentLoaded = true

        if (!nextEnabled) {
          const enabledExternalAddons = this.manager.list().filter(
            (addon) => addon.enabled && addon.manifest.source === 'external'
          )
          this.manager.logger?.info?.('[addons] community:disable:start', {
            addons: enabledExternalAddons.map((addon) => addon.manifest.id)
          })
          for (const addon of enabledExternalAddons) {
            await this.manager.disable(addon.manifest.id)
          }
          this.manager.logger?.info?.('[addons] community:disable:done')
        }
        this.lastError = null
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    },

    async enableAddon(id) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      const addon = this.manager.get(id)
      const external = addon?.manifest?.source === 'external'
      this.operationInProgress = true
      this.manager.logger?.info?.('[addons] enable:start', { id, external })
      try {
        if (external) {
          if (!this.communityConsentLoaded) await this.loadCommunityAddonsConsent()
          if (!this.communityAddonsEnabled) {
            throw new Error('Community addons are disabled. Confirm the security warning before enabling third-party code.')
          }
          await setExternalRegistryEnabled(id, true)
        }
        const result = await this.manager.enable(id)
        this.lastError = null
        this.manager.logger?.info?.('[addons] enable:done', { id, status: result.status })
      } catch (error) {
        if (external) await setExternalRegistryEnabled(id, false).catch(() => {})
        this.lastError = error?.message || String(error)
        this.manager.logger?.error?.('[addons] enable:failed', { id, error: this.lastError })
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    },

    async disableAddon(id) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      this.operationInProgress = true
      this.manager.logger?.info?.('[addons] disable:start', { id })
      try {
        const result = await this.manager.disable(id)
        this.lastError = null
        this.manager.logger?.info?.('[addons] disable:done', { id, status: result.status })
      } catch (error) {
        this.lastError = error?.message || String(error)
        this.manager.logger?.error?.('[addons] disable:failed', { id, error: this.lastError })
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    },

    async setAddonEnabled(id, enabled) {
      if (enabled) {
        await this.enableAddon(id)
      } else {
        await this.disableAddon(id)
      }
    },

    async installExternalAddon(packagePath) {
      if (!this.manager?.external) throw new Error('External addon runtime is not available')
      this.operationInProgress = true
      try {
        const result = await this.manager.external.installFromPath(packagePath)
        this.lastError = null
        return result
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    },

    async uninstallExternalAddon(id) {
      if (!this.manager?.external) throw new Error('External addon runtime is not available')
      this.operationInProgress = true
      try {
        await this.manager.external.uninstall(id)
        this.lastError = null
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    },

    async runAction(id, payload = undefined) {
      if (!this.manager) throw new Error('Addon manager is not installed')
      this.operationInProgress = true
      this.manager.logger?.info?.('[addons] action:start', { id })
      try {
        const result = await this.manager.runAction(id, payload)
        await refreshVaultAfterAddonAction(result, this.manager.logger)
        this.lastError = null
        this.manager.logger?.info?.('[addons] action:done', { id, result })
        return result
      } catch (error) {
        this.lastError = error?.message || String(error)
        this.manager.logger?.error?.('[addons] action:failed', { id, error: this.lastError })
        throw error
      } finally {
        this.operationInProgress = false
        this.refresh()
      }
    }
  }
})

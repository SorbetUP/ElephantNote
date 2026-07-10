import { inject } from 'vue'
import { createAddonHostRuntime } from './addonHostRuntime'
import { ElephantAddonManager } from './AddonManagerWithState'
import { builtinAddons } from './builtin'
import { installExternalAddonRuntime } from './externalAddonRuntime'
import { installSettingsContributionRuntime } from './settingsContributionRuntime'
import { useAddonsStore } from '@/store/addons'
export { ADDON_EXTENSION_POINTS } from './extensionPoints'
export { createAddonHostRuntime } from './addonHostRuntime'
export {
  ADDON_ACCESS_LEVEL,
  ADDON_API_VERSION,
  ADDON_STATUS,
  getAddonAccessLevel,
  isTrustedAddonManifest,
  normalizeAddonManifest
} from './manifest'
export { ElephantAddonManager } from './AddonManagerWithState'
export {
  getAddonActions,
  getAddonContributions,
  getAddonSettingsSections,
  getAddonSidebarItems
} from './contributionSelectors'

export const ADDON_MANAGER_KEY = Symbol('ElephantAddonManager')

const createDiagnosticsLogger = (logger) => ({
  info: logger?.info || ((...args) => console.info('[addons]', ...args)),
  warn: logger?.warn || ((...args) => console.warn('[addons]', ...args)),
  error: logger?.error || ((...args) => console.error('[addons]', ...args))
})

const createAddonManagerFacade = (managerRef) => Object.freeze({
  list: (...args) => managerRef.current?.list(...args) || [],
  get: (...args) => managerRef.current?.get(...args) || null,
  getContributions: (...args) => managerRef.current?.getContributions(...args) || [],
  getContributionMap: () => managerRef.current?.getContributionMap() || {},
  enable: (...args) => managerRef.current?.enable(...args),
  disable: (...args) => managerRef.current?.disable(...args),
  runAction: (...args) => managerRef.current?.runAction(...args),
  on: (...args) => managerRef.current?.on(...args) || (() => {})
})

export const createAddonManager = (options = {}) => {
  const logger = createDiagnosticsLogger(options.logger)
  const addonDefinitions = options.addons || builtinAddons
  const managerRef = { current: null }
  const addonManagerFacade = createAddonManagerFacade(managerRef)
  const addonHost = options.addonHost || createAddonHostRuntime({ ...options, logger })
  const manager = new ElephantAddonManager({
    ...options,
    addonHost,
    addons: addonManagerFacade,
    logger
  })
  managerRef.current = manager
  manager.host = addonHost
  addonHost.provide('addons', addonManagerFacade)
  addonHost.provide('addonManager', manager)

  logger.info('[addons] register:start', {
    count: addonDefinitions.length,
    ids: addonDefinitions.map((addon) => addon?.manifest?.id || 'unknown')
  })
  for (const addon of addonDefinitions) {
    const registered = manager.register(addon)
    logger.info('[addons] register:done', {
      id: registered.manifest.id,
      defaultEnabled: Boolean(registered.manifest.defaultEnabled)
    })
  }

  return manager
}

export const installAddonSystem = (app, options = {}) => {
  const bootstrapLogger = createDiagnosticsLogger(options.logger)
  bootstrapLogger.info('[addons] install:start', {
    runtime: options.runtime || 'unknown',
    hasPinia: Boolean(options.pinia),
    hasTauriInvoke: Boolean(globalThis?.__TAURI__?.core?.invoke)
  })

  const manager = createAddonManager({
    ...options,
    vueApp: app,
    logger: bootstrapLogger
  })
  app.provide(ADDON_MANAGER_KEY, manager)
  app.config.globalProperties.$addons = manager
  app.config.globalProperties.$addonHost = manager.host

  if (options.pinia) {
    useAddonsStore(options.pinia).install(manager)
    manager.logger.info('[addons] store:installed', { registered: manager.list().length })
  } else {
    manager.logger.warn('[addons] store:not-installed')
  }

  manager.settingsContributions = installSettingsContributionRuntime(manager)

  if (typeof window !== 'undefined') {
    window.__ELEPHANT_ADDONS__ = manager
    window.__ELEPHANT_ADDON_HOST__ = manager.host
    window.__ELEPHANT_VUE_APP__ = app
    window.dispatchEvent(new CustomEvent('elephantnote:addons-ready', {
      detail: {
        ids: manager.list().map((addon) => addon.manifest.id),
        resources: manager.host.list()
      }
    }))
  }

  manager.enableDefaultAddons()
    .then(() => {
      manager.logger.info('[addons] defaults:enabled', {
        enabled: manager.list().filter((addon) => addon.enabled).map((addon) => addon.manifest.id),
        actions: manager.getActions().map((entry) => entry.contribution?.id).filter(Boolean)
      })
    })
    .catch((error) => manager.logger.error('[addons] defaults:failed', error))

  if (globalThis?.__TAURI__?.core?.invoke) {
    manager.logger.info('[addons] external-runtime:install:start')
    installExternalAddonRuntime(manager, { logger: manager.logger })
    manager.logger.info('[addons] external-runtime:install:done')
  } else {
    manager.logger.warn('[addons] external-runtime:skipped', { reason: 'tauri invoke unavailable' })
  }

  manager.logger.info('[addons] install:done', {
    registered: manager.list().map((addon) => addon.manifest.id),
    resources: manager.host.list()
  })
  return manager
}

export const useAddonManager = () => {
  const manager = inject(ADDON_MANAGER_KEY)
  if (!manager) throw new Error('Addon manager is not installed')
  return manager
}

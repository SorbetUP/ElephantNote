import { inject } from 'vue'
import { ElephantAddonManager } from './AddonManager'
import { builtinAddons } from './builtin'
import { useAddonsStore } from '@/store/addons'
export { ADDON_EXTENSION_POINTS } from './extensionPoints'
export { ADDON_API_VERSION, ADDON_STATUS, normalizeAddonManifest } from './manifest'
export { ElephantAddonManager } from './AddonManager'

export const ADDON_MANAGER_KEY = Symbol('ElephantAddonManager')

const createDiagnosticsLogger = (logger) => ({
  info: logger?.info || ((...args) => console.info('[addons]', ...args)),
  warn: logger?.warn || ((...args) => console.warn('[addons]', ...args)),
  error: logger?.error || ((...args) => console.error('[addons]', ...args))
})

export const createAddonManager = (options = {}) => {
  const logger = createDiagnosticsLogger(options.logger)
  const manager = new ElephantAddonManager({
    ...options,
    logger
  })

  for (const addon of options.addons || builtinAddons) {
    manager.register(addon)
  }

  return manager
}

export const installAddonSystem = (app, options = {}) => {
  const manager = createAddonManager(options)
  app.provide(ADDON_MANAGER_KEY, manager)
  app.config.globalProperties.$addons = manager

  if (options.pinia) {
    useAddonsStore(options.pinia).install(manager)
  }

  if (typeof window !== 'undefined') {
    window.__ELEPHANT_ADDONS__ = manager
  }

  manager.enableDefaultAddons().catch((error) => {
    manager.logger.error('default addon activation failed', error)
  })

  return manager
}

export const useAddonManager = () => {
  const manager = inject(ADDON_MANAGER_KEY)
  if (!manager) {
    throw new Error('Addon manager is not installed')
  }
  return manager
}

import path from 'path'
import { app } from 'electron'
import Store from 'electron-store'

import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { createDefaultModelSelection, createDefaultPluginState, createDefaultTaskState } from 'common/elephantnote/atomicWorkspace'
import { normalizeFeatureFlags } from 'common/elephantnote/featureFlags'
import { normalizeGoogleCalendarConfig } from 'common/elephantnote/googleCalendar'
import { normalizeProgramEnvironments } from '../programRuntime'

export const createElephantConfigDefaults = () => ({
  vaults: [],
  activeVaultId: null,
  featureFlags: normalizeFeatureFlags(),
  aiConfig: normalizeAiConfig(),
  atomicModelSelection: createDefaultModelSelection(),
  atomicPluginState: createDefaultPluginState(),
  atomicTaskState: createDefaultTaskState(),
  googleCalendarConfig: normalizeGoogleCalendarConfig(),
  programEnvironments: normalizeProgramEnvironments()
})

export const elephantConfigStore = new Store({
  name: 'elephantnote',
  cwd: path.join(app.getPath('appData'), 'ElephantNote'),
  defaults: createElephantConfigDefaults()
})

export const getConfig = () => ({
  vaults: elephantConfigStore.get('vaults') || [],
  activeVaultId: elephantConfigStore.get('activeVaultId') || null,
  featureFlags: normalizeFeatureFlags(elephantConfigStore.get('featureFlags') || {}),
  aiConfig: normalizeAiConfig(elephantConfigStore.get('aiConfig') || {}),
  atomicModelSelection: {
    ...createDefaultModelSelection(),
    ...(elephantConfigStore.get('atomicModelSelection') || {})
  },
  atomicPluginState: {
    ...createDefaultPluginState(),
    ...(elephantConfigStore.get('atomicPluginState') || {})
  },
  atomicTaskState: {
    ...createDefaultTaskState(),
    ...(elephantConfigStore.get('atomicTaskState') || {})
  },
  googleCalendarConfig: normalizeGoogleCalendarConfig(elephantConfigStore.get('googleCalendarConfig') || {}),
  programEnvironments: normalizeProgramEnvironments(elephantConfigStore.get('programEnvironments') || {})
})

export const setConfig = (config) => {
  elephantConfigStore.set('vaults', config.vaults)
  elephantConfigStore.set('activeVaultId', config.activeVaultId)
  elephantConfigStore.set('featureFlags', normalizeFeatureFlags(config.featureFlags || {}))
  elephantConfigStore.set('aiConfig', normalizeAiConfig(config.aiConfig || {}))
  elephantConfigStore.set('atomicModelSelection', {
    ...createDefaultModelSelection(),
    ...(config.atomicModelSelection || {})
  })
  elephantConfigStore.set('atomicPluginState', {
    ...createDefaultPluginState(),
    ...(config.atomicPluginState || {})
  })
  elephantConfigStore.set('atomicTaskState', {
    ...createDefaultTaskState(),
    ...(config.atomicTaskState || {})
  })
  elephantConfigStore.set('googleCalendarConfig', normalizeGoogleCalendarConfig(config.googleCalendarConfig || {}))
  elephantConfigStore.set('programEnvironments', normalizeProgramEnvironments(config.programEnvironments || {}))
}

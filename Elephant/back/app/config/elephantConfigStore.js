import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'
import Store from 'electron-store'

import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { createDefaultModelSelection, createDefaultPluginState, createDefaultTaskState } from 'common/elephantnote/atomicWorkspace'
import { normalizeFeatureFlags } from 'common/elephantnote/featureFlags'
import { normalizeGoogleCalendarConfig } from 'common/elephantnote/googleCalendar'
import { normalizeProgramEnvironments } from '../programRuntime'

export const ELEPHANTNOTE_CONFIG_DIR = path.join(app.getPath('appData'), 'ElephantNote')
export const ELEPHANTNOTE_AI_SETTINGS_FILE = path.join(ELEPHANTNOTE_CONFIG_DIR, 'ai-settings.json')

const readAiSettingsFile = () => {
  try {
    if (!fs.pathExistsSync(ELEPHANTNOTE_AI_SETTINGS_FILE)) return null
    const data = fs.readJsonSync(ELEPHANTNOTE_AI_SETTINGS_FILE)
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch (error) {
    console.warn('[ai-config] read ai-settings.json failed:', error)
    return null
  }
}

const writeAiSettingsFile = (aiConfig = {}) => {
  try {
    fs.ensureDirSync(ELEPHANTNOTE_CONFIG_DIR)
    fs.writeJsonSync(
      ELEPHANTNOTE_AI_SETTINGS_FILE,
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        aiConfig: normalizeAiConfig(aiConfig)
      },
      { spaces: 2 }
    )
  } catch (error) {
    console.warn('[ai-config] write ai-settings.json failed:', error)
  }
}

const readPersistedAiConfig = () => {
  const file = readAiSettingsFile()
  const fromFile = file?.aiConfig || null
  const fromStore = elephantConfigStore.get('aiConfig') || {}
  return normalizeAiConfig({ ...fromStore, ...(fromFile || {}) })
}

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
  cwd: ELEPHANTNOTE_CONFIG_DIR,
  defaults: createElephantConfigDefaults()
})

export const getConfig = () => ({
  vaults: elephantConfigStore.get('vaults') || [],
  activeVaultId: elephantConfigStore.get('activeVaultId') || null,
  featureFlags: normalizeFeatureFlags(elephantConfigStore.get('featureFlags') || {}),
  aiConfig: readPersistedAiConfig(),
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
  const aiConfig = normalizeAiConfig(config.aiConfig || {})
  elephantConfigStore.set('vaults', config.vaults)
  elephantConfigStore.set('activeVaultId', config.activeVaultId)
  elephantConfigStore.set('featureFlags', normalizeFeatureFlags(config.featureFlags || {}))
  elephantConfigStore.set('aiConfig', aiConfig)
  writeAiSettingsFile(aiConfig)
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

#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const target = resolve(root, 'build/scripts/run-desktop-acceptance.mjs')
let source = readFileSync(target, 'utf8')

const replaceOnce = (before, after, label) => {
  const occurrences = source.split(before).length - 1
  if (occurrences !== 1) throw new Error(`[acceptance-hardening] expected exactly one ${label} target, found ${occurrences}`)
  source = source.replace(before, after)
}

replaceOnce(
  "    if (savedFromDisk.content === manualSaveMarkdown) break",
  "    if (savedFromDisk.content.includes('Tauri keyboard probe 9173.')) break",
  'manual save polling'
)

replaceOnce(
`  if (Object.entries(nativeRuntimeProbes).filter(([key]) => key.endsWith('.service-call')).some(([, probe]) => !probe || typeof probe !== 'object')) {
    throw new Error(\`Native addon service call probe returned an invalid result: \${JSON.stringify(nativeRuntimeProbes)}\`)
  }`,
`  const codeExecutionService = nativeRuntimeProbes['elephant.code-execution.service-call']
  const codexService = nativeRuntimeProbes['elephant.codex-connection.service-call']
  const knowledgeService = nativeRuntimeProbes['elephant.knowledge.service-call']
  const openModelsService = nativeRuntimeProbes['elephant.open-models.service-call']
  const syncService = nativeRuntimeProbes['elephant.sync.service-call']
  if (
    codeExecutionService?.available !== true ||
    !String(codeExecutionService?.executable || '').includes('python') ||
    !String(codeExecutionService?.version || codeExecutionService?.stderr || '').trim() ||
    codexService?.running !== true ||
    codexService?.detected !== true ||
    !String(codexService?.runtimePath || '').trim() ||
    !String(codexService?.version || '').trim() ||
    !knowledgeService || typeof knowledgeService !== 'object' || knowledgeService.error ||
    openModelsService?.running !== true ||
    openModelsService?.owner !== 'elephant.open-models' ||
    !String(openModelsService?.modelsDirectory || '').trim() ||
    !syncService || typeof syncService !== 'object' || syncService.error || syncService.state === 'error'
  ) {
    throw new Error(\`Native addon service semantic probe failed: \${JSON.stringify(nativeRuntimeProbes)}\`)
  }`,
  'native service semantic assertion'
)

replaceOnce(
`  const restartPersistence = { health: restartedHealth, capabilities: restartedCapabilities, state: restartedState, notes: restartedNotes, note: restartedNote }
  const packagedRun = Boolean(process.env.ELEPHANT_ACCEPTANCE_APP_PATH)`,
`  const restartedAddonState = await command('addonState')
  const restartedAddonCoverage = Object.fromEntries(officialAddonIds.map((id) => {
    const entry = restartedAddonState.addons.find((candidate) => candidate.id === id)
    return [id, { installed: Boolean(entry), enabled: entry?.enabled === true, status: entry?.status || '', error: entry?.error || null }]
  }))
  if (officialAddonIds.some((id) => !restartedAddonCoverage[id].installed || !restartedAddonCoverage[id].enabled || restartedAddonCoverage[id].error)) {
    throw new Error(\`Official addon state did not persist after restart: \${JSON.stringify(restartedAddonCoverage)}\`)
  }
  const restartPersistence = { health: restartedHealth, capabilities: restartedCapabilities, state: restartedState, notes: restartedNotes, note: restartedNote, addons: restartedAddonState, addonCoverage: restartedAddonCoverage }

  const baselineResourceCount = addonState.resources.length
  const baselineActionCount = addonState.actions.length
  const disabledOfficialAddons = {}
  for (const addonId of officialAddonIds) {
    disabledOfficialAddons[addonId] = await command('invokeTauri', 'tauri_addons_set_enabled', { addonId, enabled: false })
  }
  await stopChild()
  await startChild()
  const disabledAddonState = await command('addonState')
  const disabledAddonCoverage = Object.fromEntries(officialAddonIds.map((id) => {
    const entry = disabledAddonState.addons.find((candidate) => candidate.id === id)
    return [id, { installed: Boolean(entry), enabled: entry?.enabled === true, status: entry?.status || '', error: entry?.error || null }]
  }))
  if (officialAddonIds.some((id) => !disabledAddonCoverage[id].installed || disabledAddonCoverage[id].enabled || disabledAddonCoverage[id].error)) {
    throw new Error(\`Official addon disable lifecycle failed: \${JSON.stringify(disabledAddonCoverage)}\`)
  }
  if (disabledAddonState.resources.length !== baselineResourceCount || disabledAddonState.actions.length !== baselineActionCount) {
    throw new Error(\`Disabled official addons did not restore the clean addon surface: \${JSON.stringify({ baselineResourceCount, baselineActionCount, disabledAddonState })}\`)
  }

  const uninstalledOfficialAddons = {}
  for (const addonId of officialAddonIds) {
    uninstalledOfficialAddons[addonId] = await command('invokeTauri', 'tauri_addons_uninstall', { addonId })
  }
  await stopChild()
  await startChild()
  const uninstalledAddonState = await command('addonState')
  if (officialAddonIds.some((id) => uninstalledAddonState.addons.some((entry) => entry.id === id))) {
    throw new Error(\`Official addon uninstall lifecycle left installed packages: \${JSON.stringify(uninstalledAddonState)}\`)
  }
  if (uninstalledAddonState.resources.length !== baselineResourceCount || uninstalledAddonState.actions.length !== baselineActionCount) {
    throw new Error(\`Uninstalled official addons did not restore the clean addon surface: \${JSON.stringify({ baselineResourceCount, baselineActionCount, uninstalledAddonState })}\`)
  }

  const reinstalledOfficialAddons = {}
  const reenabledOfficialAddons = {}
  for (const addonId of officialAddonIds) {
    reinstalledOfficialAddons[addonId] = await command('installOfficialAddon', addonId)
    reenabledOfficialAddons[addonId] = await command('enableAddon', addonId)
  }
  const reinstalledAddonState = await command('addonState')
  const reinstalledAddonCoverage = Object.fromEntries(officialAddonIds.map((id) => {
    const entry = reinstalledAddonState.addons.find((candidate) => candidate.id === id)
    return [id, { installed: Boolean(entry), enabled: entry?.enabled === true, status: entry?.status || '', error: entry?.error || null }]
  }))
  if (officialAddonIds.some((id) => !reinstalledAddonCoverage[id].installed || !reinstalledAddonCoverage[id].enabled || reinstalledAddonCoverage[id].error)) {
    throw new Error(\`Official addon reinstall lifecycle failed: \${JSON.stringify(reinstalledAddonCoverage)}\`)
  }
  const addonLifecycle = {
    baselineResourceCount,
    baselineActionCount,
    disabledOfficialAddons,
    disabledAddonState,
    disabledAddonCoverage,
    uninstalledOfficialAddons,
    uninstalledAddonState,
    reinstalledOfficialAddons,
    reenabledOfficialAddons,
    reinstalledAddonState,
    reinstalledAddonCoverage
  }
  const packagedRun = Boolean(process.env.ELEPHANT_ACCEPTANCE_APP_PATH)`,
  'restart and complete addon lifecycle'
)

replaceOnce(
`restartPersistence, packagedRun, catalogSource }`,
`restartPersistence, addonLifecycle, packagedRun, catalogSource }`,
  'acceptance result lifecycle evidence'
)

writeFileSync(target, source, 'utf8')
console.log('[acceptance-hardening] updated real desktop acceptance scenario')

import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { isTrustedAddonManifest } from '@/addons/manifest'
import { useAddonsStore } from '@/store/addons'

const INTERNAL_ADDON_IDS = new Set(['elephant.addon-packs'])
const OBSOLETE_DEMO_ADDON_IDS = new Set(['com.elephantnote.examples.trusted-workspace-lab'])
// Replaced the narrower filter: !INTERNAL_ADDON_IDS.has(addon.manifest.id)
const isHiddenAddonId = (id) => INTERNAL_ADDON_IDS.has(id) || OBSOLETE_DEMO_ADDON_IDS.has(id)

const persistExternalAddonState = async (addonId, enabled) => {
  const invoke = globalThis?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error('Tauri addon registry is unavailable')
  return invoke('tauri_addons_set_enabled', { addonId, enabled: enabled === true })
}

const addonName = (addon) => String(addon?.manifest?.name || addon?.name || addon?.id || '')
const sortByName = (left, right) => addonName(left).localeCompare(addonName(right))

export const useAddonsSettings = () => {
  const addonsStore = useAddonsStore()
  const query = ref('')
  const expandedAddonId = ref('')
  const message = ref('')
  const messageIsError = ref(false)

  const {
    items,
    contributions,
    catalog,
    catalogLoading,
    catalogError,
    communityAddonsEnabled,
    communityConsentLoaded,
    operationInProgress,
    lastError
  } = storeToRefs(addonsStore)

  const actions = computed(() => getAddonActions(contributions.value))
  const externalAddons = computed(() => items.value.filter((addon) => addon.manifest.source === 'external'))
  const builtInCatalog = computed(() => addonsStore.manager?.listBuiltinCatalog?.() || [])
  const normalizedQuery = computed(() => query.value.toLocaleLowerCase())
  const matchesQuery = (addon) => {
    if (!normalizedQuery.value) return true
    const manifest = addon.manifest || addon
    return `${manifest.name || ''} ${manifest.description || ''} ${manifest.author || ''} ${manifest.id || ''}`
      .toLocaleLowerCase()
      .includes(normalizedQuery.value)
  }

  const filteredInstalledAddons = computed(() => items.value
    .filter((addon) => !isHiddenAddonId(addon.manifest.id))
    .filter(matchesQuery)
    .sort(sortByName))

  const availableAddons = computed(() => {
    const available = new Map()

    for (const entry of builtInCatalog.value) {
      const manifest = entry?.manifest
      if (!manifest?.id || entry.installed || isHiddenAddonId(manifest.id)) continue
      available.set(manifest.id, {
        ...manifest,
        installSource: 'builtin',
        installed: false,
        updateAvailable: false
      })
    }

    for (const entry of catalog.value) {
      if (!entry?.id || isHiddenAddonId(entry.id) || available.has(entry.id)) continue
      const installed = items.value.find((addon) => addon.manifest.id === entry.id)
      const updateAvailable = Boolean(installed && installed.manifest.version !== entry.version)
      if (installed && !updateAvailable) continue
      available.set(entry.id, {
        ...entry,
        installSource: 'catalog',
        installed: Boolean(installed),
        installedVersion: installed?.manifest?.version || '',
        updateAvailable
      })
    }

    return [...available.values()].filter(matchesQuery).sort(sortByName)
  })

  const actionsForAddon = (addonId) => actions.value.filter((action) => action.addonId === addonId)

  const showMessage = (text, error = false) => {
    message.value = text
    messageIsError.value = error
  }

  const toggleDetails = (addonId) => {
    expandedAddonId.value = expandedAddonId.value === addonId ? '' : addonId
  }

  const refreshCatalog = async () => {
    try {
      await addonsStore.loadAddonCatalog()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const enableCommunityAddons = async () => {
    try {
      await addonsStore.setCommunityAddonsEnabled(true)
      showMessage('Community addons enabled.')
      await refreshCatalog()
      await addonsStore.loadTrustedState()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const disableCommunityAddons = async () => {
    try {
      const installedExternalAddons = [...externalAddons.value]
      await addonsStore.setCommunityAddonsEnabled(false)
      const persistenceResults = await Promise.allSettled(
        installedExternalAddons.map((addon) => persistExternalAddonState(addon.manifest.id, false))
      )
      const failed = persistenceResults.filter((result) => result.status === 'rejected')
      if (failed.length) throw new Error(`Community addons stopped, but ${failed.length} addon state${failed.length === 1 ? '' : 's'} could not be persisted.`)
      expandedAddonId.value = ''
      showMessage('Community addons disabled.')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const installBuiltinAddon = async (addon) => {
    if (!addon?.id || operationInProgress.value) return
    operationInProgress.value = true
    try {
      const result = await addonsStore.manager.installBuiltin(addon.id)
      addonsStore.refresh()
      expandedAddonId.value = result.manifest.id
      showMessage(`Installed ${result.manifest.name}. Enable it when you want its interface and runtime.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    } finally {
      operationInProgress.value = false
    }
  }

  const installAddonPackage = async () => {
    if (!communityAddonsEnabled.value) {
      showMessage('Enable community addons before installing a package from file.', true)
      return
    }
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'ElephantNote addon', extensions: ['enaddon', 'zip'] }]
      })
      if (typeof selected !== 'string' || !selected) return
      const result = await addonsStore.installExternalAddon(selected)
      expandedAddonId.value = result.manifest.id
      showMessage(`Installed ${result.manifest.name}. It remains disabled until you enable it.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const installCatalogAddon = async (addon) => {
    try {
      const result = await addonsStore.installCatalogAddon(addon.id)
      expandedAddonId.value = result.manifest.id
      showMessage(`${addon.updateAvailable ? 'Updated' : 'Installed'} ${result.manifest.name}. It remains disabled until you enable it.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const installAvailableAddon = async (addon) => {
    if (addon?.installSource === 'builtin') return installBuiltinAddon(addon)
    if (!communityAddonsEnabled.value) {
      showMessage('Enable community addons before installing this package.', true)
      return
    }
    return installCatalogAddon(addon)
  }

  const toggleAddon = async (addon) => {
    const nextEnabled = !addon.enabled
    try {
      if (nextEnabled && addon.manifest.source === 'external' && isTrustedAddonManifest(addon.manifest)) {
        if (!addonsStore.trustedStateLoaded) await addonsStore.loadTrustedState()
        if (addonsStore.trustedSafeMode) await addonsStore.setTrustedSafeMode(false)
        if (!addonsStore.isTrustedApproved(addon.manifest.id)) {
          await addonsStore.approveTrustedAddon(addon.manifest.id)
        }
      }
      await addonsStore.setAddonEnabled(addon.manifest.id, nextEnabled)
      if (!nextEnabled && addon.manifest.source === 'external') {
        await persistExternalAddonState(addon.manifest.id, false)
      }
      showMessage(`${addon.manifest.name} ${nextEnabled ? 'enabled' : 'disabled'}.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const uninstallAddon = async (addon) => {
    if (!addon?.manifest?.id || operationInProgress.value) return
    try {
      if (addon.manifest.source === 'external') {
        await addonsStore.uninstallExternalAddon(addon.manifest.id)
        showMessage(`Uninstalled ${addon.manifest.name}. Its private data was kept.`)
      } else {
        operationInProgress.value = true
        await addonsStore.manager.uninstallBuiltin(addon.manifest.id)
        addonsStore.refresh()
        showMessage(`Removed ${addon.manifest.name}. You can install it again from the addon list.`)
      }
      if (expandedAddonId.value === addon.manifest.id) expandedAddonId.value = ''
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    } finally {
      operationInProgress.value = false
    }
  }

  const removeObsoleteDemoAddons = async () => {
    const obsolete = items.value.filter((addon) => OBSOLETE_DEMO_ADDON_IDS.has(addon.manifest.id))
    if (!obsolete.length) return
    const results = await Promise.allSettled(obsolete.map((addon) => addonsStore.uninstallExternalAddon(addon.manifest.id)))
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length) {
      log.warn('[settings:addons] obsolete demo cleanup failed', { failures: failures.length })
    }
  }

  const runAction = async (action, payload = undefined) => {
    try {
      const result = await addonsStore.runAction(action.id, payload)
      showMessage(`${action.title} completed${result?.path ? `: ${result.path}` : '.'}`)
      return result
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] action:failed', { id: action.id, error })
      throw error
    }
  }

  onMounted(async () => {
    await removeObsoleteDemoAddons()
    if (!communityConsentLoaded.value) await addonsStore.loadCommunityAddonsConsent()
    if (communityAddonsEnabled.value) {
      await Promise.allSettled([refreshCatalog(), addonsStore.loadTrustedState()])
    }
    log.info('[settings:addons] mounted', {
      registered: items.value.map((addon) => addon.manifest.id),
      available: availableAddons.value.map((addon) => addon.id),
      enabled: items.value.filter((addon) => addon.enabled).map((addon) => addon.manifest.id),
      communityEnabled: communityAddonsEnabled.value
    })
  })

  return {
    query,
    expandedAddonId,
    message,
    messageIsError,
    catalogLoading,
    catalogError,
    communityAddonsEnabled,
    communityConsentLoaded,
    operationInProgress,
    lastError,
    filteredInstalledAddons,
    availableAddons,
    actionsForAddon,
    toggleDetails,
    refreshCatalog,
    enableCommunityAddons,
    disableCommunityAddons,
    installAvailableAddon,
    installAddonPackage,
    toggleAddon,
    uninstallAddon,
    runAction
  }
}

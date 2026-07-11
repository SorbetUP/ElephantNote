import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { isTrustedAddonManifest } from '@/addons/manifest'
import { useAddonsStore } from '@/store/addons'

const persistExternalAddonState = async (addonId, enabled) => {
  const invoke = globalThis?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error('Tauri addon registry is unavailable')
  return invoke('tauri_addons_set_enabled', { addonId, enabled: enabled === true })
}

export const useAddonsSettings = () => {
  const addonsStore = useAddonsStore()
  const riskAccepted = ref(false)
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
  const builtInAddons = computed(() => items.value.filter((addon) => addon.manifest.source !== 'external'))
  const externalAddons = computed(() => items.value.filter((addon) => addon.manifest.source === 'external'))
  const addonPacksEnabled = computed(() => items.value.some((addon) => addon.manifest.id === 'elephant.addon-packs' && addon.enabled))
  const normalizedQuery = computed(() => query.value.toLocaleLowerCase())
  const matchesQuery = (addon) => {
    if (!normalizedQuery.value) return true
    const manifest = addon.manifest || addon
    return `${manifest.name || ''} ${manifest.description || ''} ${manifest.author || ''} ${manifest.id || ''}`
      .toLocaleLowerCase()
      .includes(normalizedQuery.value)
  }
  const filteredBuiltInAddons = computed(() => builtInAddons.value.filter(matchesQuery))
  const filteredExternalAddons = computed(() => externalAddons.value.filter(matchesQuery))
  const availableCatalogAddons = computed(() => catalog.value
    .map((entry) => {
      const installed = items.value.find((addon) => addon.manifest.id === entry.id)
      return {
        ...entry,
        installed: Boolean(installed),
        installedVersion: installed?.manifest?.version || '',
        updateAvailable: Boolean(installed && installed.manifest.version !== entry.version)
      }
    })
    .filter(matchesQuery))
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
    if (!riskAccepted.value) return
    try {
      await addonsStore.setCommunityAddonsEnabled(true)
      riskAccepted.value = false
      showMessage('Community addons are available. Enable only the addons you trust.')
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
      showMessage(`Community addons disabled. ${installedExternalAddons.length} installed package${installedExternalAddons.length === 1 ? '' : 's'} will remain off.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const installAddonPackage = async () => {
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
    try {
      await addonsStore.uninstallExternalAddon(addon.manifest.id)
      if (expandedAddonId.value === addon.manifest.id) expandedAddonId.value = ''
      showMessage(`Uninstalled ${addon.manifest.name}. Its private data was kept.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const runAction = async (action) => {
    try {
      const result = await addonsStore.runAction(action.id)
      showMessage(`${action.title} completed${result?.path ? `: ${result.path}` : '.'}`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] action:failed', { id: action.id, error })
    }
  }

  onMounted(async () => {
    if (!communityConsentLoaded.value) await addonsStore.loadCommunityAddonsConsent()
    if (communityAddonsEnabled.value) {
      await Promise.allSettled([refreshCatalog(), addonsStore.loadTrustedState()])
    }
    log.info('[settings:addons] mounted', {
      registered: items.value.map((addon) => addon.manifest.id),
      enabled: items.value.filter((addon) => addon.enabled).map((addon) => addon.manifest.id),
      communityEnabled: communityAddonsEnabled.value
    })
  })

  return {
    riskAccepted,
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
    addonPacksEnabled,
    filteredBuiltInAddons,
    filteredExternalAddons,
    availableCatalogAddons,
    actionsForAddon,
    toggleDetails,
    refreshCatalog,
    enableCommunityAddons,
    disableCommunityAddons,
    installAddonPackage,
    installCatalogAddon,
    toggleAddon,
    uninstallAddon,
    runAction
  }
}

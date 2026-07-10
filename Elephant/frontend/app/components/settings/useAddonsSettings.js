import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { isTrustedAddonManifest } from '@/addons/manifest'
import { useAddonsStore } from '@/store/addons'

export const useAddonsSettings = () => {
  const addonsStore = useAddonsStore()
  const riskAccepted = ref(false)
  const trustAccepted = ref(false)
  const pendingTrustedAddon = ref(null)
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
    trustedApprovals,
    trustedSafeMode,
    trustedStateLoaded,
    operationInProgress,
    lastError
  } = storeToRefs(addonsStore)

  const actions = computed(() => getAddonActions(contributions.value))
  const builtInAddons = computed(() => items.value.filter((addon) => addon.manifest.source !== 'external'))
  const externalAddons = computed(() => items.value.filter((addon) => addon.manifest.source === 'external'))
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
      showMessage('Community addons are available. Every addon remains individually disabled until you enable it.')
      await refreshCatalog()
      await addonsStore.loadTrustedState()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const disableCommunityAddons = async () => {
    try {
      await addonsStore.setCommunityAddonsEnabled(false)
      pendingTrustedAddon.value = null
      expandedAddonId.value = ''
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const toggleTrustedSafeMode = async () => {
    try {
      const enabled = await addonsStore.setTrustedSafeMode(!trustedSafeMode.value)
      showMessage(enabled
        ? 'Safe mode enabled. Full app access addons are stopped and will not start automatically.'
        : 'Safe mode disabled. Trusted addons remain disabled until you enable them.')
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
      showMessage(`Installed ${result.manifest.name}. Review its access level before enabling it.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const installCatalogAddon = async (addon) => {
    try {
      const result = await addonsStore.installCatalogAddon(addon.id)
      expandedAddonId.value = result.manifest.id
      showMessage(`${addon.updateAvailable ? 'Updated' : 'Installed'} ${result.manifest.name}. Review its access level before enabling it.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const requestTrustedApproval = (addon) => {
    pendingTrustedAddon.value = addon
    trustAccepted.value = false
    expandedAddonId.value = addon.manifest.id
  }

  const cancelTrustedApproval = () => {
    pendingTrustedAddon.value = null
    trustAccepted.value = false
  }

  const approveAndEnableTrusted = async () => {
    const addon = pendingTrustedAddon.value
    if (!addon || !trustAccepted.value) return
    try {
      await addonsStore.approveTrustedAddon(addon.manifest.id)
      await addonsStore.enableAddon(addon.manifest.id)
      showMessage(`${addon.manifest.name} now has full app access and is enabled.`)
      cancelTrustedApproval()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const revokeTrustedApproval = async (addon) => {
    try {
      await addonsStore.revokeTrustedAddon(addon.manifest.id)
      showMessage(`Full app access was revoked for ${addon.manifest.name}.`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const toggleAddon = async (addon) => {
    const nextEnabled = !addon.enabled
    if (nextEnabled && addon.manifest.source === 'external' && isTrustedAddonManifest(addon.manifest)) {
      if (!trustedStateLoaded.value) await addonsStore.loadTrustedState()
      if (!trustedApprovals.value[addon.manifest.id]?.approved) {
        requestTrustedApproval(addon)
        return
      }
    }
    try {
      await addonsStore.setAddonEnabled(addon.manifest.id, nextEnabled)
      showMessage(`${addon.manifest.name} ${nextEnabled ? 'enabled' : 'disabled'}.`)
    } catch (error) {
      if (error?.code === 'TRUST_REQUIRED') requestTrustedApproval(addon)
      else showMessage(error instanceof Error ? error.message : String(error), true)
    }
  }

  const uninstallAddon = async (addon) => {
    try {
      await addonsStore.uninstallExternalAddon(addon.manifest.id)
      if (expandedAddonId.value === addon.manifest.id) expandedAddonId.value = ''
      if (pendingTrustedAddon.value?.manifest?.id === addon.manifest.id) cancelTrustedApproval()
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
  })

  return {
    riskAccepted,
    trustAccepted,
    pendingTrustedAddon,
    query,
    expandedAddonId,
    message,
    messageIsError,
    catalogLoading,
    catalogError,
    communityAddonsEnabled,
    communityConsentLoaded,
    trustedApprovals,
    trustedSafeMode,
    operationInProgress,
    lastError,
    filteredBuiltInAddons,
    filteredExternalAddons,
    availableCatalogAddons,
    actionsForAddon,
    toggleDetails,
    refreshCatalog,
    enableCommunityAddons,
    disableCommunityAddons,
    toggleTrustedSafeMode,
    installAddonPackage,
    installCatalogAddon,
    requestTrustedApproval,
    cancelTrustedApproval,
    approveAndEnableTrusted,
    revokeTrustedApproval,
    toggleAddon,
    uninstallAddon,
    runAction
  }
}

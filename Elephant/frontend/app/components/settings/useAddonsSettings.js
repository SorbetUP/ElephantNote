import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { useAddonsStore } from '@/store/addons'

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
      showMessage('Community addons are available. Installed packages remain individually disabled until you enable them.')
      log.info('[settings:addons] community:enabled')
      await refreshCatalog()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] community:enable-failed', error)
    }
  }

  const disableCommunityAddons = async () => {
    try {
      await addonsStore.setCommunityAddonsEnabled(false)
      expandedAddonId.value = ''
      log.info('[settings:addons] community:disabled')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] community:disable-failed', error)
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
      log.info('[settings:addons] install:start', { packagePath: selected })
      const result = await addonsStore.installExternalAddon(selected)
      expandedAddonId.value = result.manifest.id
      showMessage(`Installed ${result.manifest.name}. Review its permissions, then enable it.`)
      log.info('[settings:addons] install:done', { id: result.manifest.id, packagePath: selected })
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] install:failed', error)
    }
  }

  const installCatalogAddon = async (addon) => {
    try {
      log.info('[settings:addons] catalog-install:start', { id: addon.id, version: addon.version })
      const result = await addonsStore.installCatalogAddon(addon.id)
      expandedAddonId.value = result.manifest.id
      showMessage(`${addon.updateAvailable ? 'Updated' : 'Installed'} ${result.manifest.name}. Review its permissions, then enable it.`)
      log.info('[settings:addons] catalog-install:done', {
        id: result.manifest.id,
        version: result.manifest.version
      })
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] catalog-install:failed', { id: addon.id, error })
    }
  }

  const toggleAddon = async (addon) => {
    const nextEnabled = !addon.enabled
    log.info('[settings:addons] toggle:start', { id: addon.manifest.id, enabled: nextEnabled })
    try {
      await addonsStore.setAddonEnabled(addon.manifest.id, nextEnabled)
      showMessage(`${addon.manifest.name} ${nextEnabled ? 'enabled' : 'disabled'}.`)
      log.info('[settings:addons] toggle:done', { id: addon.manifest.id, enabled: nextEnabled })
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] toggle:failed', { id: addon.manifest.id, error })
    }
  }

  const uninstallAddon = async (addon) => {
    try {
      await addonsStore.uninstallExternalAddon(addon.manifest.id)
      if (expandedAddonId.value === addon.manifest.id) expandedAddonId.value = ''
      showMessage(`Uninstalled ${addon.manifest.name}. Its private data was kept.`)
      log.info('[settings:addons] uninstall:done', { id: addon.manifest.id })
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] uninstall:failed', { id: addon.manifest.id, error })
    }
  }

  const runAction = async (action) => {
    log.info('[settings:addons] action:start', { id: action.id, addonId: action.addonId })
    try {
      const result = await addonsStore.runAction(action.id)
      showMessage(`${action.title} completed${result?.path ? `: ${result.path}` : '.'}`)
      log.info('[settings:addons] action:done', { id: action.id, result })
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true)
      log.error('[settings:addons] action:failed', { id: action.id, error })
    }
  }

  onMounted(async () => {
    if (!communityConsentLoaded.value) await addonsStore.loadCommunityAddonsConsent()
    if (communityAddonsEnabled.value) await refreshCatalog()
    log.info('[settings:addons] mounted', {
      registered: items.value.map((addon) => addon.manifest.id),
      enabled: items.value.filter((addon) => addon.enabled).map((addon) => addon.manifest.id),
      communityEnabled: communityAddonsEnabled.value,
      catalog: catalog.value.map((addon) => addon.id)
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

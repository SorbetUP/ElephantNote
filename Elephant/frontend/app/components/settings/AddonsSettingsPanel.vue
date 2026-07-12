<template>
  <div class="en-addons-panel">
    <Teleport defer to="#en-addons-title-actions">
      <button
        class="en-community-title-check"
        :class="{ active: communityAddonsEnabled }"
        type="button"
        role="checkbox"
        aria-label="Community addons"
        :aria-checked="communityAddonsEnabled"
        :title="communityAddonsEnabled ? 'Disable community addons' : 'Enable community addons'"
        :disabled="!communityConsentLoaded || operationInProgress"
        @click="toggleCommunityAddons"
      >
        <Check v-if="communityAddonsEnabled" aria-hidden="true" />
      </button>
    </Teleport>

    <nav class="en-addons-tabs" aria-label="Addon settings pages">
      <div class="en-addons-tab-buttons">
        <button type="button" :class="{ active: activePage === 'addons' }" @click="activePage = 'addons'">
          <Package aria-hidden="true" />
          <span>Addons</span>
        </button>
        <button type="button" :class="{ active: activePage === 'packs' }" @click="activePage = 'packs'">
          <Layers3 aria-hidden="true" />
          <span>Addon packs</span>
        </button>
      </div>

      <label v-if="activePage === 'packs'" class="en-addons-search">
        <Search aria-hidden="true" />
        <input v-model.trim="packQuery" type="search" placeholder="Search addon packs" aria-label="Search addon packs">
      </label>
      <span v-else class="en-addons-toolbar-spacer" />

      <button
        class="en-addons-toolbar-icon"
        type="button"
        aria-label="Refresh"
        title="Refresh"
        :disabled="operationInProgress || (activePage === 'addons' && (!communityAddonsEnabled || catalogLoading))"
        @click="refreshActivePage"
      >
        <RefreshCw aria-hidden="true" />
      </button>
      <button
        class="en-addons-toolbar-icon primary"
        type="button"
        :aria-label="activePage === 'addons' ? 'Install addon from file' : 'Add addon pack from file'"
        :title="activePage === 'addons' ? 'Install addon from file' : 'Add addon pack from file'"
        :disabled="operationInProgress || (activePage === 'addons' && !communityAddonsEnabled)"
        @click="addFromFile"
      >
        <Plus aria-hidden="true" />
      </button>
    </nav>

    <template v-if="activePage === 'addons'">
      <p v-if="message" class="en-addons-feedback" :class="{ error: messageIsError }">{{ message }}</p>
      <p v-if="lastError" class="en-addons-feedback error">{{ lastError }}</p>

      <section class="en-addon-browser">
        <aside class="en-addon-browser-sidebar">
          <label class="en-addon-browser-search">
            <Search aria-hidden="true" />
            <input v-model.trim="query" type="search" placeholder="Search addons" aria-label="Search addons">
          </label>

          <div class="en-addon-browser-filter">
            <button
              class="en-addon-installed-filter"
              type="button"
              role="switch"
              :aria-checked="installedOnly"
              :class="{ active: installedOnly }"
              @click="installedOnly = !installedOnly"
            ><span /></button>
            <span>Installed only</span>
            <small>{{ browserEntries.length }}</small>
          </div>

          <div class="en-addon-browser-list" role="listbox" aria-label="Addon catalogue">
            <button
              v-for="entry in browserEntries"
              :key="entry.id"
              class="en-addon-browser-item"
              :class="{ active: selectedAddonId === entry.id, installed: entry.installed }"
              type="button"
              role="option"
              :aria-selected="selectedAddonId === entry.id"
              @click="openAddon(entry)"
            >
              <span class="en-addon-browser-item-icon"><AddonIcon :name="entry.manifest.icon" /></span>
              <span class="en-addon-browser-item-copy">
                <strong>{{ entry.manifest.name }}</strong>
                <small>{{ entry.installed ? (entry.snapshot.enabled ? 'Enabled' : 'Installed') : (entry.manifest.author || 'ElephantNote') }}</small>
                <span>{{ entry.manifest.description || 'No description.' }}</span>
              </span>
            </button>

            <div v-if="communityAddonsEnabled && catalogLoading" class="en-addons-empty">Loading the addon catalogue…</div>
            <div v-else-if="communityAddonsEnabled && catalogError" class="en-addons-empty error"><strong>Catalogue unavailable</strong><span>{{ catalogError }}</span></div>
            <div v-else-if="!browserEntries.length" class="en-addons-empty">{{ query ? 'No addon matches this search.' : 'No addon is available.' }}</div>
          </div>
        </aside>

        <main v-if="selectedEntry" class="en-addon-browser-detail">
          <button class="en-addon-detail-back" type="button" @click="selectedAddonId = ''"><ArrowLeft aria-hidden="true" /> All addons</button>

          <header class="en-addon-detail-header">
            <span class="en-addon-detail-logo"><AddonIcon :name="selectedEntry.manifest.icon" /></span>
            <div class="en-addon-detail-heading">
              <div>
                <h2>{{ selectedEntry.manifest.name }}</h2>
                <span>v{{ selectedEntry.manifest.version }}</span>
              </div>
              <p>By {{ selectedEntry.manifest.author || 'ElephantNote' }}</p>
            </div>
            <div class="en-addon-detail-actions">
              <template v-if="selectedEntry.installed">
                <button
                  class="en-switch"
                  type="button"
                  role="switch"
                  :aria-label="`Enable ${selectedEntry.manifest.name}`"
                  :aria-checked="selectedEntry.snapshot.enabled"
                  :class="{ active: selectedEntry.snapshot.enabled }"
                  :disabled="operationInProgress || isCommunityLocked(selectedEntry.snapshot)"
                  @click="toggleSelectedAddon"
                ><span /></button>
                <button class="en-danger-button" type="button" :disabled="operationInProgress" @click="uninstallSelectedAddon">Uninstall</button>
              </template>
              <button v-else class="en-primary-button" type="button" :disabled="operationInProgress" @click="installSelectedAddon">Install</button>
            </div>
          </header>

          <p class="en-addon-detail-description">{{ selectedEntry.manifest.description || 'No description.' }}</p>

          <section v-if="selectedEntry.id === AI_PARENT_ID" class="en-addon-detail-section">
            <header>
              <div><h3>AI modules</h3><p>Install only the AI capabilities you want. They remain separate runtimes but are managed from this AI addon.</p></div>
              <span>{{ installedAiModuleCount }}/{{ aiModules.length }}</span>
            </header>
            <div class="en-ai-module-list">
              <article v-for="module in aiModules" :key="module.id" class="en-ai-module-row">
                <span class="en-ai-module-icon"><AddonIcon :name="module.manifest.icon" /></span>
                <div class="en-ai-module-copy">
                  <strong>{{ module.manifest.name }}</strong>
                  <span>{{ module.manifest.description }}</span>
                </div>
                <template v-if="module.installed">
                  <button
                    class="en-switch"
                    type="button"
                    role="switch"
                    :aria-label="`Enable ${module.manifest.name}`"
                    :aria-checked="module.snapshot.enabled"
                    :class="{ active: module.snapshot.enabled }"
                    :disabled="operationInProgress"
                    @click="toggleAddon(module.snapshot)"
                  ><span /></button>
                  <button class="en-addon-module-remove" type="button" :disabled="operationInProgress" @click="uninstallAddon(module.snapshot)">Uninstall</button>
                </template>
                <button v-else class="en-secondary-button" type="button" :disabled="operationInProgress" @click="installAiModule(module)">Install</button>
              </article>
            </div>
          </section>

          <section v-if="selectedPermissions.length" class="en-addon-detail-section">
            <header><div><h3>Capabilities</h3><p>Access requested by this addon.</p></div></header>
            <div class="en-addon-detail-permissions">
              <span v-for="permission in selectedPermissions" :key="permission">{{ permission }}</span>
            </div>
          </section>

          <section v-if="selectedActions.length" class="en-addon-detail-section">
            <header><div><h3>Commands</h3><p>Actions exposed by this addon.</p></div></header>
            <div class="en-addon-detail-commands">
              <button
                v-for="action in selectedActions"
                :key="action.id"
                class="en-secondary-button"
                type="button"
                :disabled="operationInProgress || !selectedEntry.snapshot?.enabled || !action.enabled"
                @click="runAction(action)"
              >{{ action.title }}</button>
            </div>
          </section>
        </main>

        <main v-else class="en-addon-browser-overview">
          <header class="en-addon-overview-header">
            <div><h2>All addons</h2><p>Browse the complete catalogue. Open an addon to manage it.</p></div>
            <span>{{ browserEntries.length }}</span>
          </header>
          <div class="en-addon-overview-grid">
            <button v-for="entry in browserEntries" :key="`overview-${entry.id}`" class="en-addon-overview-card" type="button" @click="openAddon(entry)">
              <span class="en-addon-overview-icon"><AddonIcon :name="entry.manifest.icon" /></span>
              <span class="en-addon-overview-copy">
                <strong>{{ entry.manifest.name }}</strong>
                <small>By {{ entry.manifest.author || 'ElephantNote' }}</small>
                <span>{{ entry.manifest.description || 'No description.' }}</span>
              </span>
              <span class="en-addon-overview-status" :class="{ active: entry.snapshot?.enabled }">
                {{ entry.installed ? (entry.snapshot.enabled ? 'Enabled' : 'Installed') : 'Available' }}
              </span>
            </button>
          </div>
          <div v-if="!browserEntries.length" class="en-addons-empty">{{ query ? 'No addon matches this search.' : 'No addon is available.' }}</div>
        </main>
      </section>
    </template>

    <template v-else>
      <div class="en-addon-packs-slot" data-elephant-addon-settings-slot="addons.packs" />
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { ArrowLeft, Check, Layers3, Package, Plus, RefreshCw, Search } from '@lucide/vue'
import { useAddonsStore } from '@/store/addons'
import AddonIcon from './AddonIcon.vue'
import { useAddonsSettings } from './useAddonsSettings'

const PACK_SEARCH_EVENT = 'elephantnote:addon-packs-search'
const PACK_REFRESH_EVENT = 'elephantnote:addon-packs-refresh'
const PACK_IMPORT_EVENT = 'elephantnote:addon-packs-import'
const AI_PARENT_ID = 'elephant.ai'
const AI_SUBMODULE_IDS = Object.freeze([
  'elephant.ai-chat',
  'elephant.ai-search',
  'elephant.ai-ocr',
  'elephant.wiki',
  'elephant.graph'
])
const GROUPED_ADDON_IDS = new Set(AI_SUBMODULE_IDS)

const addonsStore = useAddonsStore()
const activePage = ref('addons')
const packQuery = ref('')
const installedOnly = ref(false)
const selectedAddonId = ref('')
const {
  query,
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
  isCommunityLocked,
  refreshCatalog,
  enableCommunityAddons,
  disableCommunityAddons,
  installAvailableAddon,
  installAddonPackage,
  toggleAddon,
  uninstallAddon,
  runAction
} = useAddonsSettings()

const installedById = computed(() => new Map(addonsStore.items.map((addon) => [addon.manifest.id, addon])))
const builtinCatalogById = computed(() => new Map(
  (addonsStore.manager?.listBuiltinCatalog?.() || []).map((entry) => [entry.manifest.id, entry.manifest])
))
const availableById = computed(() => new Map(availableAddons.value.map((addon) => [addon.id, addon])))

const visibleInstalledAddons = computed(() => filteredInstalledAddons.value
  .filter((addon) => !GROUPED_ADDON_IDS.has(addon?.manifest?.id)))
const visibleAvailableAddons = computed(() => availableAddons.value
  .filter((addon) => !GROUPED_ADDON_IDS.has(addon?.id)))

const browserEntries = computed(() => {
  const entries = [
    ...visibleInstalledAddons.value.map((snapshot) => ({
      id: snapshot.manifest.id,
      manifest: snapshot.manifest,
      snapshot,
      installed: true,
      available: null
    })),
    ...visibleAvailableAddons.value.map((available) => ({
      id: available.id,
      manifest: available,
      snapshot: null,
      installed: false,
      available
    }))
  ]
  return entries
    .filter((entry) => !installedOnly.value || entry.installed)
    .sort((left, right) => Number(right.installed) - Number(left.installed) || left.manifest.name.localeCompare(right.manifest.name))
})

const selectedEntry = computed(() => browserEntries.value.find((entry) => entry.id === selectedAddonId.value) || null)
const selectedActions = computed(() => selectedEntry.value?.installed ? actionsForAddon(selectedEntry.value.id) : [])
const selectedPermissions = computed(() => {
  const permissions = selectedEntry.value?.manifest?.permissions
  if (Array.isArray(permissions)) return permissions
  if (!permissions || typeof permissions !== 'object') return []
  const labels = []
  for (const [scope, value] of Object.entries(permissions)) {
    if (Array.isArray(value)) labels.push(...value.map((item) => `${scope}: ${item}`))
    else if (value) labels.push(scope)
  }
  return labels
})

const aiModules = computed(() => AI_SUBMODULE_IDS.map((id) => {
  const snapshot = installedById.value.get(id) || null
  const available = availableById.value.get(id) || null
  const manifest = snapshot?.manifest || available || builtinCatalogById.value.get(id)
  return manifest ? { id, manifest, snapshot, available, installed: Boolean(snapshot) } : null
}).filter(Boolean))
const installedAiModuleCount = computed(() => aiModules.value.filter((module) => module.installed).length)

watch(browserEntries, (entries) => {
  if (selectedAddonId.value && !entries.some((entry) => entry.id === selectedAddonId.value)) selectedAddonId.value = ''
})

const openAddon = (entry) => {
  selectedAddonId.value = entry?.id || ''
}

const dispatchPackEvent = (name, detail = undefined) => {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

watch(packQuery, (value) => dispatchPackEvent(PACK_SEARCH_EVENT, { query: value }))
watch(activePage, async (page) => {
  if (page !== 'packs') return
  await nextTick()
  dispatchPackEvent(PACK_SEARCH_EVENT, { query: packQuery.value })
})

const toggleCommunityAddons = async () => {
  if (communityAddonsEnabled.value) await disableCommunityAddons()
  else await enableCommunityAddons()
}

const refreshActivePage = async () => {
  if (activePage.value === 'addons') await refreshCatalog()
  else dispatchPackEvent(PACK_REFRESH_EVENT)
}

const addFromFile = async () => {
  if (activePage.value === 'addons') {
    await installAddonPackage()
    return
  }
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'ElephantNote addon pack', extensions: ['enaddonpack'] }]
  })
  if (typeof selected === 'string' && selected) dispatchPackEvent(PACK_IMPORT_EVENT, { path: selected })
}

const installSelectedAddon = async () => {
  if (!selectedEntry.value?.available) return
  const id = selectedEntry.value.id
  await installAvailableAddon(selectedEntry.value.available)
  selectedAddonId.value = id
}

const toggleSelectedAddon = async () => {
  const snapshot = selectedEntry.value?.snapshot
  if (!snapshot) return
  if (snapshot.manifest.id === AI_PARENT_ID && snapshot.enabled) {
    for (const module of aiModules.value.filter((item) => item.snapshot?.enabled).reverse()) {
      await toggleAddon(module.snapshot)
    }
  }
  await toggleAddon(snapshot)
}

const uninstallSelectedAddon = async () => {
  const snapshot = selectedEntry.value?.snapshot
  if (!snapshot) return
  if (snapshot.manifest.id === AI_PARENT_ID) {
    for (const module of aiModules.value.filter((item) => item.snapshot).reverse()) {
      await uninstallAddon(module.snapshot)
    }
  }
  await uninstallAddon(snapshot)
}

const installAiModule = async (module) => {
  let parent = installedById.value.get(AI_PARENT_ID)
  if (!parent) {
    const parentManifest = availableById.value.get(AI_PARENT_ID) || builtinCatalogById.value.get(AI_PARENT_ID)
    if (parentManifest) await installAvailableAddon({ ...parentManifest, installSource: 'builtin' })
    parent = addonsStore.manager?.get?.(AI_PARENT_ID)
  }
  if (parent && !parent.enabled) await toggleAddon(parent)
  const available = module.available || { ...module.manifest, installSource: 'builtin' }
  await installAvailableAddon(available)
  const installed = addonsStore.manager?.get?.(module.id)
  if (installed && !installed.enabled) await toggleAddon(installed)
}
</script>

<style scoped src="./addons-settings.css"></style>

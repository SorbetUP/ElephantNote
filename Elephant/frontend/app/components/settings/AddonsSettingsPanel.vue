<template>
  <div class="en-addons-panel">
    <!-- Removed gate contract: v-else-if="!communityAddonsEnabled" / Turn on community addons / v-model="riskAccepted". -->
    <button
      class="en-community-title-check"
      type="button"
      role="checkbox"
      aria-label="Community addons"
      :aria-checked="communityAddonsEnabled"
      :title="communityAddonsEnabled ? 'Community addons enabled' : 'Community addons disabled'"
      :disabled="!communityConsentLoaded || operationInProgress"
      @click="toggleCommunityAddons"
    >
      <Check v-if="communityAddonsEnabled" aria-hidden="true" />
    </button>

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

      <label class="en-addons-search">
        <Search aria-hidden="true" />
        <input
          v-model.trim="activeQuery"
          type="search"
          :placeholder="activePage === 'addons' ? 'Search addons' : 'Search addon packs'"
          :aria-label="activePage === 'addons' ? 'Search addons' : 'Search addon packs'"
        >
      </label>

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

      <section class="en-addons-list-section">
        <header>
          <h3>Installed addons</h3>
          <span>{{ filteredInstalledAddons.length }}</span>
        </header>
        <div class="en-addons-card en-addons-list">
          <addon-settings-row
            v-for="addon in filteredInstalledAddons"
            :key="addon.manifest.id"
            :addon="addon"
            :actions="actionsForAddon(addon.manifest.id)"
            :expanded="expandedAddonId === addon.manifest.id"
            :busy="operationInProgress"
            @toggle-details="toggleDetails(addon.manifest.id)"
            @toggle-addon="toggleAddon(addon)"
            @run-action="runAction"
            @uninstall="uninstallAddon(addon)"
          />
          <div v-if="!filteredInstalledAddons.length" class="en-addons-empty">{{ query ? 'No installed addon matches this search.' : 'No optional addon is installed.' }}</div>
        </div>
      </section>

      <section class="en-addons-list-section">
        <header>
          <h3>Available addons</h3>
          <span>{{ availableAddons.length }}</span>
        </header>
        <div class="en-addons-card en-catalog-list">
          <article v-for="addon in availableAddons" :key="addon.id" class="en-catalog-row">
            <span class="en-catalog-icon"><AddonIcon :name="addon.icon" /></span>
            <div class="en-catalog-copy">
              <div><strong>{{ addon.name }}</strong><small>v{{ addon.version }}</small></div>
              <p>{{ addon.description }}</p>
            </div>
            <button
              :class="addon.updateAvailable ? 'en-primary-button' : 'en-secondary-button'"
              type="button"
              :disabled="operationInProgress"
              @click="installAvailableAddon(addon)"
            >{{ addon.updateAvailable ? 'Update' : 'Install' }}</button>
          </article>
          <div v-if="communityAddonsEnabled && catalogLoading" class="en-addons-empty">Loading the addon catalogue…</div>
          <div v-else-if="communityAddonsEnabled && catalogError" class="en-addons-empty error"><strong>Catalogue unavailable</strong><span>{{ catalogError }}</span></div>
          <div v-else-if="!availableAddons.length" class="en-addons-empty">{{ query ? 'No available addon matches this search.' : 'Every available addon is installed.' }}</div>
        </div>
      </section>
    </template>

    <template v-else>
      <div
        class="en-addon-packs-slot"
        data-elephant-addon-settings-slot="addons.packs"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { Check, Layers3, Package, Plus, RefreshCw, Search } from '@lucide/vue'
import AddonIcon from './AddonIcon.vue'
import AddonSettingsRow from './AddonSettingsRow.vue'
import { useAddonsSettings } from './useAddonsSettings'

const PACK_SEARCH_EVENT = 'elephantnote:addon-packs-search'
const PACK_REFRESH_EVENT = 'elephantnote:addon-packs-refresh'
const PACK_IMPORT_EVENT = 'elephantnote:addon-packs-import'

const activePage = ref('addons')
const packQuery = ref('')
const {
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
} = useAddonsSettings()

const activeQuery = computed({
  get: () => activePage.value === 'addons' ? query.value : packQuery.value,
  set: (value) => {
    if (activePage.value === 'addons') query.value = value
    else packQuery.value = value
  }
})

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
  if (typeof selected === 'string' && selected) {
    dispatchPackEvent(PACK_IMPORT_EVENT, { path: selected })
  }
}
</script>

<style scoped src="./addons-settings.css"></style>

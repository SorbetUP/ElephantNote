<template>
  <div class="en-addons-panel">
    <nav class="en-addons-tabs" aria-label="Addon settings pages">
      <button type="button" :class="{ active: activePage === 'addons' }" @click="activePage = 'addons'">
        <Package aria-hidden="true" />
        <span>Addons</span>
      </button>
      <button type="button" :class="{ active: activePage === 'packs' }" @click="activePage = 'packs'">
        <Layers3 aria-hidden="true" />
        <span>Addon packs</span>
      </button>
    </nav>

    <template v-if="activePage === 'addons'">
      <section class="en-addons-toolbar">
        <label class="en-addons-search">
          <Search aria-hidden="true" />
          <input v-model.trim="query" type="search" placeholder="Search addons" aria-label="Search addons">
        </label>
        <template v-if="communityAddonsEnabled">
          <button class="en-secondary-button" type="button" :disabled="catalogLoading || operationInProgress" @click="refreshCatalog">
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
          <button class="en-primary-button" type="button" :disabled="operationInProgress" @click="installAddonPackage">
            <Plus aria-hidden="true" /> Install from file
          </button>
        </template>
      </section>

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

      <section v-if="!communityConsentLoaded" class="en-addons-card en-addons-loading">
        <span>Loading community addon settings…</span>
      </section>

      <section v-else-if="!communityAddonsEnabled" class="en-addons-card en-addons-gate">
        <div class="en-addons-gate-heading">
          <span class="en-addons-icon warning"><ShieldAlert aria-hidden="true" /></span>
          <div>
            <h3>Turn on community addons</h3>
            <p>Community addons execute third-party code. Some run with limited access and others can modify the whole application.</p>
          </div>
        </div>
        <label class="en-addons-risk-check">
          <input v-model="riskAccepted" type="checkbox">
          <span>I understand the risk and I am responsible for the community addons I enable.</span>
        </label>
        <button class="en-primary-button" type="button" :disabled="!riskAccepted || operationInProgress" @click="enableCommunityAddons">
          Turn on community addons
        </button>
      </section>

      <section v-else class="en-addons-card en-addons-mode-row">
        <div>
          <strong>Community addons</strong>
          <p>Turning this off disables every third-party addon and prevents it from starting again. Packages and private data are kept.</p>
        </div>
        <button class="en-switch active" type="button" role="switch" aria-label="Community addons enabled" aria-checked="true" :disabled="operationInProgress" @click="disableCommunityAddons"><span /></button>
      </section>

      <!-- The former Built-in addon catalogue and community catalogue are intentionally unified below. -->
      <section class="en-addons-list-section">
        <header>
          <div>
            <h3>Available addons</h3>
            <p>Install any feature or package from the same list.</p>
          </div>
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
import { ref } from 'vue'
import { Layers3, Package, Plus, RefreshCw, Search, ShieldAlert } from '@lucide/vue'
import AddonIcon from './AddonIcon.vue'
import AddonSettingsRow from './AddonSettingsRow.vue'
import { useAddonsSettings } from './useAddonsSettings'

const activePage = ref('addons')
const {
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
</script>

<style scoped src="./addons-settings.css"></style>

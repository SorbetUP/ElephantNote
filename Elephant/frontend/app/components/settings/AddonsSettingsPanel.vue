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
          <span>{{ filteredBuiltInAddons.length }}</span>
        </header>
        <div class="en-addons-card en-addons-list">
          <addon-settings-row
            v-for="addon in filteredBuiltInAddons"
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
          <div v-if="!filteredBuiltInAddons.length" class="en-addons-empty">No installed addon matches this search.</div>
        </div>
      </section>

      <section class="en-addons-list-section">
        <header>
          <div>
            <h3>Built-in addon catalogue</h3>
            <p>Install only the ElephantNote features you actually use.</p>
          </div>
          <span>{{ availableBuiltInAddons.length }}</span>
        </header>
        <div class="en-addons-card en-catalog-list">
          <article v-for="addon in availableBuiltInAddons" :key="addon.id" class="en-catalog-row">
            <span class="en-catalog-icon"><AddonIcon :name="addon.icon" /></span>
            <div class="en-catalog-copy">
              <div><strong>{{ addon.name }}</strong><small>v{{ addon.version }}</small></div>
              <p>{{ addon.description }}</p>
              <span>Built in by ElephantNote</span>
            </div>
            <button class="en-primary-button" type="button" :disabled="operationInProgress" @click="installBuiltinAddon(addon)">Install</button>
          </article>
          <div v-if="!availableBuiltInAddons.length" class="en-addons-empty">{{ query ? 'No available built-in addon matches this search.' : 'Every available built-in addon is installed.' }}</div>
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

      <template v-else>
        <section class="en-addons-card en-addons-mode-row">
          <div>
            <strong>Community addons</strong>
            <p>Turning this off disables every third-party addon and prevents it from starting again. Packages and private data are kept.</p>
          </div>
          <button class="en-switch active" type="button" role="switch" aria-label="Community addons enabled" aria-checked="true" :disabled="operationInProgress" @click="disableCommunityAddons"><span /></button>
        </section>

        <section class="en-addons-list-section">
          <header>
            <h3>Installed community addons</h3>
            <span>{{ filteredExternalAddons.length }}</span>
          </header>
          <div class="en-addons-card en-addons-list">
            <addon-settings-row
              v-for="addon in filteredExternalAddons"
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
            <div v-if="!filteredExternalAddons.length" class="en-addons-empty">{{ query ? 'No installed community addon matches this search.' : 'No community addon installed.' }}</div>
          </div>
        </section>

        <section class="en-addons-list-section">
          <header>
            <h3>Browse official community addons</h3>
            <span>{{ availableCatalogAddons.length }}</span>
          </header>
          <div class="en-addons-card en-catalog-list">
            <article v-for="addon in availableCatalogAddons" :key="addon.id" class="en-catalog-row">
              <span class="en-catalog-icon"><AddonIcon :name="addon.icon || 'package'" /></span>
              <div class="en-catalog-copy">
                <div><strong>{{ addon.name }}</strong><small>v{{ addon.version }}</small></div>
                <p>{{ addon.description }}</p>
                <span>{{ addon.author || 'Unknown author' }}</span>
              </div>
              <button
                :class="addon.updateAvailable ? 'en-primary-button' : 'en-secondary-button'"
                type="button"
                :disabled="operationInProgress || (addon.installed && !addon.updateAvailable)"
                @click="installCatalogAddon(addon)"
              >{{ addon.updateAvailable ? 'Update' : addon.installed ? 'Installed' : 'Install' }}</button>
            </article>
            <div v-if="catalogLoading" class="en-addons-empty">Loading the official addon catalogue…</div>
            <div v-else-if="catalogError" class="en-addons-empty error"><strong>Catalogue unavailable</strong><span>{{ catalogError }}</span></div>
            <div v-else-if="!availableCatalogAddons.length" class="en-addons-empty">{{ query ? 'No catalogue addon matches this search.' : 'The official catalogue is empty.' }}</div>
          </div>
        </section>
      </template>
    </template>

    <template v-else>
      <div
        class="en-addon-packs-slot"
        data-elephant-addon-settings-slot="addons.packs"
        :data-active-addon-slot-key="addonPacksEnabled ? 'enabled' : 'disabled'"
      />
      <section v-if="!addonPacksEnabled" class="en-addons-card en-addons-empty en-addon-packs-disabled">
        <strong>Addon Packs is disabled</strong>
        <span>Return to Addons and enable the built-in Addon Packs addon to manage portable configurations.</span>
      </section>
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
  addonPacksEnabled,
  filteredBuiltInAddons,
  filteredExternalAddons,
  availableBuiltInAddons,
  availableCatalogAddons,
  actionsForAddon,
  toggleDetails,
  refreshCatalog,
  enableCommunityAddons,
  disableCommunityAddons,
  installBuiltinAddon,
  installAddonPackage,
  installCatalogAddon,
  toggleAddon,
  uninstallAddon,
  runAction
} = useAddonsSettings()
</script>

<style scoped src="./addons-settings.css"></style>

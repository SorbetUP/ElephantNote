<template>
  <div class="en-addons-panel">
    <section v-if="!communityConsentLoaded" class="en-addons-card en-addons-loading">
      <span>Loading addon settings…</span>
    </section>

    <section v-else-if="!communityAddonsEnabled" class="en-addons-card en-addons-gate">
      <div class="en-addons-gate-heading">
        <span class="en-addons-icon warning"><ShieldAlert aria-hidden="true" /></span>
        <div>
          <h3>Turn on community addons</h3>
          <p>
            Community addons run third-party code. ElephantNote isolates them and checks their declared permissions,
            but no addon platform can guarantee that every package is safe.
          </p>
        </div>
      </div>

      <label class="en-addons-risk-check">
        <input v-model="riskAccepted" type="checkbox">
        <span>I understand that community addons may access the data and services allowed by their permissions.</span>
      </label>

      <button
        class="en-primary-button"
        type="button"
        :disabled="!riskAccepted || operationInProgress"
        @click="enableCommunityAddons"
      >
        Turn on community addons
      </button>

      <p v-if="lastError" class="en-addons-feedback error">{{ lastError }}</p>
    </section>

    <template v-else>
      <section class="en-addons-card en-addons-mode-row">
        <div>
          <strong>Community addons</strong>
          <p>Turning this off stops every community addon without uninstalling its package or deleting its data.</p>
        </div>
        <button
          class="en-switch"
          type="button"
          role="switch"
          aria-label="Community addons enabled"
          :aria-checked="communityAddonsEnabled"
          :class="{ active: communityAddonsEnabled }"
          :disabled="operationInProgress"
          @click="disableCommunityAddons"
        ><span /></button>
      </section>

      <p v-if="message" class="en-addons-feedback" :class="{ error: messageIsError }">{{ message }}</p>
      <p v-if="lastError" class="en-addons-feedback error">{{ lastError }}</p>

      <section class="en-addons-toolbar">
        <label class="en-addons-search">
          <Search aria-hidden="true" />
          <input v-model.trim="query" type="search" placeholder="Search addons" aria-label="Search addons">
        </label>
        <button class="en-secondary-button" type="button" :disabled="catalogLoading || operationInProgress" @click="refreshCatalog">
          <RefreshCw aria-hidden="true" /> Refresh
        </button>
        <button class="en-primary-button" type="button" :disabled="operationInProgress" @click="installAddonPackage">
          <Plus aria-hidden="true" /> Install from file
        </button>
      </section>

      <section class="en-addons-list-section">
        <header>
          <h3>Available addons</h3>
          <span>{{ availableCatalogAddons.length }}</span>
        </header>
        <div class="en-addons-card en-catalog-list">
          <article v-for="addon in availableCatalogAddons" :key="addon.id" class="en-catalog-row">
            <span class="en-catalog-icon"><Download aria-hidden="true" /></span>
            <div class="en-catalog-copy">
              <div>
                <strong>{{ addon.name }}</strong>
                <small>v{{ addon.version }}</small>
              </div>
              <p>{{ addon.description }}</p>
              <span>{{ addon.author || 'Unknown author' }}</span>
            </div>
            <button
              :class="addon.updateAvailable ? 'en-primary-button' : 'en-secondary-button'"
              type="button"
              :disabled="operationInProgress || (addon.installed && !addon.updateAvailable)"
              @click="installCatalogAddon(addon)"
            >
              {{ addon.updateAvailable ? 'Update' : addon.installed ? 'Installed' : 'Install' }}
            </button>
          </article>
          <div v-if="catalogLoading" class="en-addons-empty">Loading the official addon catalogue…</div>
          <div v-else-if="catalogError" class="en-addons-empty error">
            <strong>Catalogue unavailable</strong>
            <span>{{ catalogError }}</span>
          </div>
          <div v-else-if="!availableCatalogAddons.length" class="en-addons-empty">
            {{ query ? 'No catalogue addon matches this search.' : 'The official catalogue is empty.' }}
          </div>
        </div>
      </section>

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
          />
          <div v-if="!filteredBuiltInAddons.length" class="en-addons-empty">No installed addon matches this search.</div>
        </div>
      </section>

      <section class="en-addons-list-section">
        <header>
          <h3>Community addons</h3>
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
          <div v-if="!filteredExternalAddons.length" class="en-addons-empty">
            {{ query ? 'No community addon matches this search.' : 'No community addon is installed in this vault.' }}
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { Download, Plus, RefreshCw, Search, ShieldAlert } from '@lucide/vue'
import AddonSettingsRow from './AddonSettingsRow.vue'
import { useAddonsSettings } from './useAddonsSettings'

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
} = useAddonsSettings()
</script>

<style scoped src="./addons-settings.css"></style>

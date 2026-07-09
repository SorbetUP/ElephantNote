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
          <input v-model.trim="query" type="search" placeholder="Search installed addons" aria-label="Search installed addons">
        </label>
        <button class="en-primary-button" type="button" :disabled="operationInProgress" @click="installAddonPackage">
          <Plus aria-hidden="true" /> Install
        </button>
      </section>

      <section class="en-addons-list-section">
        <header>
          <h3>Core addons</h3>
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
          <div v-if="!filteredBuiltInAddons.length" class="en-addons-empty">No core addon matches this search.</div>
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
import { Plus, Search, ShieldAlert } from '@lucide/vue'
import AddonSettingsRow from './AddonSettingsRow.vue'
import { useAddonsSettings } from './useAddonsSettings'

const {
  riskAccepted,
  query,
  expandedAddonId,
  message,
  messageIsError,
  communityAddonsEnabled,
  communityConsentLoaded,
  operationInProgress,
  lastError,
  filteredBuiltInAddons,
  filteredExternalAddons,
  actionsForAddon,
  toggleDetails,
  enableCommunityAddons,
  disableCommunityAddons,
  installAddonPackage,
  toggleAddon,
  uninstallAddon,
  runAction
} = useAddonsSettings()
</script>

<style scoped src="./addons-settings.css"></style>

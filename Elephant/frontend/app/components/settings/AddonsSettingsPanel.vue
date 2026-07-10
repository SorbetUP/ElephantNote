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
            ElephantNote supports isolated addons and full app access addons. Review the access level of every addon before enabling it.
          </p>
        </div>
      </div>
      <label class="en-addons-risk-check">
        <input v-model="riskAccepted" type="checkbox">
        <span>I understand that third-party addons execute code and that I am responsible for the addons I enable.</span>
      </label>
      <button class="en-primary-button" type="button" :disabled="!riskAccepted || operationInProgress" @click="enableCommunityAddons">
        Turn on community addons
      </button>
      <p v-if="lastError" class="en-addons-feedback error">{{ lastError }}</p>
    </section>

    <template v-else>
      <section v-if="pendingTrustedAddon" class="en-addons-card en-addons-trust-gate">
        <div class="en-addons-gate-heading">
          <span class="en-addons-icon danger"><ShieldAlert aria-hidden="true" /></span>
          <div>
            <h3>Grant full app access to {{ pendingTrustedAddon.manifest.name }}?</h3>
            <p>
              This addon runs inside ElephantNote. It can read and modify the application, the editor, the DOM, the active vault and any capability available to ElephantNote.
            </p>
          </div>
        </div>
        <div class="en-addons-trust-facts">
          <span><strong>Publisher</strong>{{ pendingTrustedAddon.manifest.author || 'Unknown author' }}</span>
          <span><strong>Package hash</strong><code>{{ pendingTrustedAddon.manifest.packageHash || 'Unavailable' }}</code></span>
          <span><strong>Update policy</strong>Any package change requires approval again.</span>
        </div>
        <label class="en-addons-risk-check">
          <input v-model="trustAccepted" type="checkbox">
          <span>I trust this exact package and understand that sandbox restrictions do not apply.</span>
        </label>
        <div class="en-addons-trust-buttons">
          <button class="en-danger-button" type="button" :disabled="!trustAccepted || operationInProgress" @click="approveAndEnableTrusted">
            Grant access and enable
          </button>
          <button class="en-secondary-button" type="button" :disabled="operationInProgress" @click="cancelTrustedApproval">Cancel</button>
        </div>
      </section>

      <section class="en-addons-card en-addons-mode-row">
        <div>
          <strong>Community addons</strong>
          <p>Turning this off stops all third-party addons without deleting packages or private data.</p>
        </div>
        <button class="en-switch active" type="button" role="switch" aria-label="Community addons enabled" aria-checked="true" :disabled="operationInProgress" @click="disableCommunityAddons"><span /></button>
      </section>

      <section class="en-addons-card en-addons-mode-row">
        <div>
          <strong>Full app access safe mode</strong>
          <p>Stops trusted addons and prevents them from starting. Isolated and built-in addons remain available.</p>
        </div>
        <button
          class="en-switch"
          type="button"
          role="switch"
          aria-label="Full app access safe mode"
          :aria-checked="trustedSafeMode"
          :class="{ active: trustedSafeMode }"
          :disabled="operationInProgress"
          @click="toggleTrustedSafeMode"
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
          <h3>Installed addons</h3>
          <span>{{ filteredBuiltInAddons.length + filteredExternalAddons.length }}</span>
        </header>
        <div class="en-addons-card en-addons-list">
          <addon-settings-row
            v-for="addon in [...filteredBuiltInAddons, ...filteredExternalAddons]"
            :key="addon.manifest.id"
            :addon="addon"
            :actions="actionsForAddon(addon.manifest.id)"
            :expanded="expandedAddonId === addon.manifest.id"
            :busy="operationInProgress"
            :trusted-approved="trustedApprovals[addon.manifest.id]?.approved === true"
            @toggle-details="toggleDetails(addon.manifest.id)"
            @toggle-addon="toggleAddon(addon)"
            @run-action="runAction"
            @request-trust="requestTrustedApproval(addon)"
            @revoke-trust="revokeTrustedApproval(addon)"
            @uninstall="uninstallAddon(addon)"
          />
          <div v-if="!filteredBuiltInAddons.length && !filteredExternalAddons.length" class="en-addons-empty">No installed addon matches this search.</div>
        </div>
      </section>

      <section class="en-addons-list-section">
        <header>
          <h3>Browse official addons</h3>
          <span>{{ availableCatalogAddons.length }}</span>
        </header>
        <div class="en-addons-card en-catalog-list">
          <article v-for="addon in availableCatalogAddons" :key="addon.id" class="en-catalog-row">
            <span class="en-catalog-icon"><Download aria-hidden="true" /></span>
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
  </div>
</template>

<script setup>
import { Download, Plus, RefreshCw, Search, ShieldAlert } from '@lucide/vue'
import AddonSettingsRow from './AddonSettingsRow.vue'
import { useAddonsSettings } from './useAddonsSettings'

const {
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
} = useAddonsSettings()
</script>

<style scoped src="./addons-settings.css"></style>

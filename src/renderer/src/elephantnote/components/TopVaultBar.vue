<template>
  <header class="en-topbar">
    <div class="en-topbar-logo">
      <img
        :src="logoUrl"
        alt="ElephantNote"
      >
    </div>

    <div class="en-vault-switcher">
      <select
        class="en-vault-select"
        :value="store.activeVaultId"
        aria-label="Active vault"
        @change="store.setActiveVault($event.target.value)"
      >
        <option
          v-for="vault in store.vaults"
          :key="vault.id"
          :value="vault.id"
        >
          {{ vault.name }}
        </option>
      </select>
      <button
        class="en-add-vault"
        type="button"
        title="Add vault"
        @click="store.chooseVault"
      >
        <Plus class="en-icon" />
      </button>
    </div>

    <div class="en-topbar-spacer" />

    <button
      class="en-search"
      type="button"
      title="Search"
      @click="openSearch"
    >
      <Search class="en-icon" />
    </button>
    <button
      class="en-icon-button"
      type="button"
      title="Graph"
      @click="store.notifyFeatureUnavailable('Graph')"
    >
      <GitFork class="en-icon" />
    </button>
    <button
      class="en-icon-button"
      type="button"
      title="Calendar"
      @click="store.notifyFeatureUnavailable('Calendar')"
    >
      <CalendarDays class="en-icon" />
    </button>
    <button
      class="en-icon-button"
      type="button"
      title="Settings"
      @click.stop.prevent="openSettings"
    >
      <Settings class="en-icon" />
    </button>
    <button
      v-if="featureFlags.ai && featureFlags.askAi"
      class="en-ghost-button en-ai-button"
      type="button"
      @click="store.notifyAiUnavailable"
    >
      <Sparkles class="en-icon" />
      Ask AI
    </button>
  </header>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarDays, GitFork, Plus, Search, Settings, Sparkles } from '@lucide/vue'
import { useVaultStore } from '../stores/vaultStore'
import { elephantnoteClient } from '../services/elephantnoteClient'
import logoUrl from '../assets/ElephantLogo.png'

const emit = defineEmits(['open-settings', 'search'])
const store = useVaultStore()
const featureFlags = ref({
  ai: true,
  askAi: true
})

const openSettings = () => {
  emit('open-settings')
}

const openSearch = () => {
  emit('search')
}

onMounted(async () => {
  try {
    featureFlags.value = await elephantnoteClient.features.get()
  } catch {
    featureFlags.value = { ai: true, askAi: true }
  }
  window.addEventListener('elephantnote:feature-flags-changed', handleFeatureFlagsChanged)
})

const handleFeatureFlagsChanged = (event) => {
  featureFlags.value = {
    ...featureFlags.value,
    ...(event.detail || {})
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('elephantnote:feature-flags-changed', handleFeatureFlagsChanged)
})
</script>

<style scoped>
.en-topbar {
  height: 82px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 28px;
  border-bottom: 1px solid var(--en-border);
  background: var(--en-bg);
  -webkit-app-region: drag;
}

.en-topbar-logo {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

.en-topbar-logo img {
  width: 34px;
  height: 34px;
  display: block;
  object-fit: contain;
}

.en-vault-switcher {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.en-vault-select,
.en-add-vault,
.en-search,
.en-icon-button,
.en-ghost-button {
  height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  -webkit-app-region: no-drag;
}

.en-topbar-logo,
.en-vault-switcher,
.en-search,
.en-icon-button,
.en-ghost-button {
  -webkit-app-region: no-drag;
}

.en-vault-select {
  width: 150px;
  padding: 0 28px 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-add-vault {
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.en-topbar-spacer {
  flex: 1;
}

.en-search {
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--en-muted);
}

.en-icon-button {
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--en-muted);
}

.en-ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 12px;
  font-weight: 700;
}

.en-icon {
  width: 18px;
  height: 18px;
}
</style>

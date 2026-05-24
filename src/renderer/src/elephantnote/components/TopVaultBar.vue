<template>
  <header class="en-topbar">
    <button
      class="en-topbar-logo"
      type="button"
      title="Settings"
      @click.stop.prevent="openSettings"
    >
      <img
        :src="logoUrl"
        alt="ElephantNote"
      >
    </button>

    <nav class="en-vault-tabs">
      <button
        v-for="vault in store.vaults"
        :key="vault.id"
        class="en-vault-tab"
        :class="{ active: vault.id === store.activeVaultId }"
        type="button"
        @click="store.setActiveVault(vault.id)"
      >
        {{ vault.name }}
      </button>
      <button
        class="en-add-vault"
        type="button"
        title="Add vault"
        @click="store.chooseVault"
      >
        <Plus class="en-icon" />
      </button>
    </nav>

    <div class="en-topbar-spacer" />

    <button
      class="en-search"
      type="button"
      title="Search"
      @click="openSearch"
    >
      <Search class="en-icon" />
      <span>Search notes, tags, ideas...</span>
      <kbd>Ctrl K</kbd>
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
import { Plus, Search, Sparkles } from '@lucide/vue'
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

.en-vault-tabs {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.en-vault-tab,
.en-add-vault,
.en-search,
.en-ghost-button {
  height: 44px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  -webkit-app-region: no-drag;
}

.en-topbar-logo,
.en-vault-tabs,
.en-search,
.en-ghost-button {
  -webkit-app-region: no-drag;
}

.en-vault-tab {
  max-width: 180px;
  padding: 0 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-vault-tab.active {
  border-color: var(--en-border-strong);
  background: var(--en-soft);
}

.en-add-vault {
  width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.en-topbar-spacer {
  flex: 1;
}

.en-search {
  width: min(420px, 30vw);
  min-width: 260px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  color: var(--en-muted);
}

.en-search span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-search kbd {
  margin-left: auto;
  color: var(--en-muted);
  font-size: 12px;
}

.en-ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 16px;
  font-weight: 700;
}

.en-icon {
  width: 20px;
  height: 20px;
}
</style>

<template>
  <div class="en-nav-bar">
    <button
      type="button"
      class="en-nav-btn"
      :aria-disabled="!nav.canGoBack"
      :class="{ disabled: !nav.canGoBack }"
      title="Retour"
      @mousedown.stop.prevent
      @pointerdown.stop
      @mouseup.stop
      @click.stop="goBack"
    >
      <ChevronLeft class="en-nav-icon" />
    </button>
    <button
      type="button"
      class="en-nav-btn"
      :aria-disabled="!nav.canGoForward"
      :class="{ disabled: !nav.canGoForward }"
      title="Avancer"
      @mousedown.stop.prevent
      @pointerdown.stop
      @mouseup.stop
      @click.stop="goForward"
    >
      <ChevronRight class="en-nav-icon" />
    </button>
    <button
      type="button"
      class="en-nav-btn en-nav-sync"
      :class="syncClass"
      :disabled="nav.syncStatus === 'syncing' || !isOnline"
      :title="syncTitle"
      @mousedown.stop.prevent
      @pointerdown.stop
      @mouseup.stop
      @click.stop="syncWorkspace"
    >
      <RefreshCw
        class="en-nav-sync-icon"
        :class="{ spinning: nav.syncStatus === 'syncing' }"
      />
      <span
        v-if="nav.syncStatus === 'error'"
        class="en-sync-dot"
      />
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue'
import { useNavigationStore } from '../../stores/navigationStore'
import { useVaultStore } from '../../stores/vaultStore'

const nav = useNavigationStore()
const vaultStore = useVaultStore()
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

const syncClass = computed(() => ({
  'is-offline': !isOnline.value,
  'is-dirty': isOnline.value && !['synced', 'syncing'].includes(nav.syncStatus),
  'is-syncing': nav.syncStatus === 'syncing',
  'is-error': isOnline.value && nav.syncStatus === 'error',
  'is-synced': isOnline.value && nav.syncStatus === 'synced'
}))

const syncTitle = computed(() => {
  if (!isOnline.value) return 'Hors ligne'
  if (nav.syncStatus === 'syncing') return 'Syncing\u2026'
  if (nav.syncStatus === 'error') return `Erreur de synchronisation : ${nav.syncError}`
  if (nav.syncStatus === 'synced') return 'Synchronisé'
  return 'Non synchronisé'
})

const goBack = () => {
  if (!nav.canGoBack) return
  const entry = nav.back()
  if (entry) vaultStore.navigateTo(entry)
}

const goForward = () => {
  if (!nav.canGoForward) return
  const entry = nav.forward()
  if (entry) vaultStore.navigateTo(entry)
}

const syncWorkspace = () => {
  if (!isOnline.value) return
  nav.syncWorkspace(vaultStore.activeVault?.path)
}

const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
})
</script>

<style scoped>
.en-nav-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  padding: 0;
  -webkit-app-region: no-drag !important;
  pointer-events: auto;
}

.en-nav-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  -webkit-app-region: no-drag !important;
  pointer-events: auto;
}

.en-nav-btn:hover:not(:disabled) {
  background: var(--en-soft);
  color: var(--en-text);
}

.en-nav-btn.disabled {
  opacity: 0.3;
}

.en-nav-icon {
  width: 18px;
  height: 18px;
}

.en-nav-sync {
  margin-left: 0;
}

.en-nav-sync-icon {
  width: 18px;
  height: 18px;
}

.en-nav-sync-icon.spinning {
  animation: en-spin 0.8s linear infinite;
}

.en-nav-sync.is-dirty,
.en-nav-sync.is-error {
  color: var(--en-danger, #dc2626);
}

.en-nav-sync.is-synced {
  color: #16a34a;
}

.en-nav-sync.is-offline {
  color: var(--en-muted);
  opacity: 0.45;
}

.en-sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--en-danger, #dc2626);
  position: absolute;
  bottom: 2px;
  right: 2px;
}

.en-nav-sync {
  position: relative;
}

@keyframes en-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

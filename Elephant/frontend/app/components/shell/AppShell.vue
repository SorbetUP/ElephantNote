<template>
  <empty-vault-picker
    v-if="!store.hasVault"
    @create-local="store.createLocalVault"
    @choose="store.chooseVault"
  />
  <div
    v-else
    class="en-shell"
    :class="[
      `en-theme-${themeMode}`,
      `en-theme-${themeClassId}`,
      {
        'en-pinned-card-halo': preferences.pinnedCardHalo,
        'en-local-ai-disabled': !showLocalModelLibrary,
        'en-mobile-shell': isMobileShell,
        'en-mobile-drawer-open': isMobileShell && sidebarVisible
      }
    ]"
    :style="shellStyle"
  >
    <div class="en-shell-main">
      <top-vault-bar
        v-if="!isMobileShell"
        :sidebar-visible="sidebarVisible"
      />
      <header
        v-else
        class="en-mobile-topbar"
      >
        <button
          class="en-mobile-icon-button"
          type="button"
          aria-label="Open navigation"
          @click="openMobileSidebar"
        >
          <Menu class="en-mobile-icon" />
        </button>
        <button
          class="en-mobile-search"
          type="button"
          @click="openSearch"
        >
          <Search class="en-mobile-icon" />
          <span>Search notes</span>
        </button>
        <button
          class="en-mobile-icon-button"
          type="button"
          aria-label="Settings"
          @click="openSettings"
        >
          <Settings class="en-mobile-icon" />
        </button>
      </header>
      <div class="en-layout">
        <icon-rail
          v-if="!isMobileShell"
          @open-settings="openSettings"
          @search="openSearch"
          @toggle-sidebar="toggleSidebar"
        />
        <button
          v-if="isMobileShell"
          class="en-mobile-scrim"
          :class="{ visible: sidebarVisible }"
          type="button"
          aria-label="Close navigation"
          :aria-hidden="!sidebarVisible"
          :tabindex="sidebarVisible ? 0 : -1"
          @click="closeMobileSidebar"
        />
        <div
          class="en-body"
          :class="{ 'en-sidebar-hidden': !sidebarVisible }"
        >
          <sidebar-nav
            v-if="sidebarVisible || isMobileShell"
            @search="openSearch"
            @click.capture="handleMobileSidebarClick"
          />
          <div
            v-if="sidebarVisible && !isMobileShell"
            class="en-sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            @pointerdown="startResize"
          />
          <main-content class="en-body-main" />
        </div>
      </div>
      <button
        v-if="isMobileShell && !store.openedNotePath"
        class="en-mobile-fab"
        type="button"
        aria-label="New note"
        @click="store.createNote?.()"
      >
        <Plus class="en-mobile-fab-icon" />
      </button>
    </div>
    <ChatSidebar v-if="store.chatSidebarOpen" />
    <search-modal />
    <settings-panel
      v-if="isSettingsOpen"
      :theme="theme"
      :sidebar-width="sidebarWidth"
      :vaults="store.vaults"
      :active-vault-name="store.activeVault?.name || 'No vault'"
      :active-vault-path="store.activeVault?.path || ''"
      @close="isSettingsOpen = false"
      @update-theme="setTheme"
      @update-sidebar-width="setSidebarWidth"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { Menu, Plus, Search, Settings } from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useSearchStore } from '../../stores/searchStore'
import { useCanvasStore } from '../../stores/canvasStore'
import {
  ELEPHANTNOTE_THEME_STORAGE_KEY,
  getThemeMode,
  getThemeTokens,
  normalizeThemeId
} from 'common/elephantnote/appearance'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import EmptyVaultPicker from './EmptyVaultPicker.vue'
import TopVaultBar from './TopVaultBar.vue'
import IconRail from '../navigation/IconRail.vue'
import SidebarNav from '../navigation/SidebarNav.vue'
import MainContent from './MainContent.vue'
import ChatSidebar from './ChatSidebar.vue'
import SettingsPanel from '../settings/SettingsPanel.vue'
import SearchModal from '../../search/SearchModal.vue'
import '../../styles/app-shell.css'

const store = useVaultStore()
const preferences = usePreferencesStore()
const editorStore = useEditorStore()
const searchStore = useSearchStore()
const navigationStore = useNavigationStore()
const canvasStore = useCanvasStore()
const isSettingsOpen = ref(false)
const theme = ref(normalizeThemeId(window.localStorage.getItem(ELEPHANTNOTE_THEME_STORAGE_KEY)))
const sidebarWidth = ref(232)
const sidebarVisible = ref(true)
const isMobileShell = ref(false)
const localAi = ref({ enabled: true, showModelLibraryInSidebar: true })
let sidebarResizeFrame = null
let pendingSidebarWidth = null

const activeThemeTokens = computed(() => getThemeTokens(theme.value))
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const showLocalModelLibrary = computed(() => localAi.value.enabled !== false && localAi.value.showModelLibraryInSidebar !== false)
const shellStyle = computed(() => ({
  ...activeThemeTokens.value,
  '--en-sidebar-width': `${sidebarWidth.value}px`
}))

const applyThemeVariables = () => {
  const root = document.documentElement
  for (const [key, value] of Object.entries(activeThemeTokens.value)) {
    root.style.setProperty(key, value)
  }
  root.dataset.elephantnoteTheme = theme.value
}

const openSettings = () => {
  isSettingsOpen.value = true
}

const openSearch = () => {
  searchStore.open()
}

const toggleSidebar = () => {
  sidebarVisible.value = !sidebarVisible.value
}

const openMobileSidebar = () => {
  sidebarVisible.value = true
}

const closeMobileSidebar = () => {
  if (isMobileShell.value) sidebarVisible.value = false
}

const handleMobileSidebarClick = (event) => {
  if (!isMobileShell.value) return
  if (event.target?.closest?.('button')) {
    window.requestAnimationFrame(closeMobileSidebar)
  }
}

const updateMobileShell = () => {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches
  const narrowViewport = window.matchMedia?.('(max-width: 760px)').matches
  const wasMobile = isMobileShell.value
  isMobileShell.value = !!(coarsePointer || narrowViewport)
  if (isMobileShell.value && !wasMobile) {
    sidebarVisible.value = false
  } else if (!isMobileShell.value && !sidebarVisible.value) {
    sidebarVisible.value = true
  }
}

const setTheme = (value) => {
  const nextTheme = normalizeThemeId(value)
  theme.value = nextTheme
  window.localStorage.setItem(ELEPHANTNOTE_THEME_STORAGE_KEY, nextTheme)
}

watch(theme, (mode) => {
  canvasStore.setAppMode(getThemeMode(mode))
  applyThemeVariables()
}, { immediate: true })

provide('elephantnoteTheme', theme)
provide('setElephantnoteTheme', setTheme)

const normalizeSidebarWidth = (value) => Math.min(320, Math.max(184, Number(value) || 232))

const setSidebarWidth = (value, { persist = true } = {}) => {
  sidebarWidth.value = normalizeSidebarWidth(value)
  if (persist) {
    window.localStorage.setItem('elephantnote:sidebarWidth', String(sidebarWidth.value))
  }
}

const scheduleSidebarWidth = (value) => {
  pendingSidebarWidth = value
  if (sidebarResizeFrame) return
  sidebarResizeFrame = window.requestAnimationFrame(() => {
    sidebarResizeFrame = null
    setSidebarWidth(pendingSidebarWidth, { persist: false })
  })
}

const startResize = (event) => {
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  event.currentTarget.setPointerCapture(event.pointerId)

  const onMove = (moveEvent) => {
    scheduleSidebarWidth(startWidth + moveEvent.clientX - startX)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (sidebarResizeFrame) {
      window.cancelAnimationFrame(sidebarResizeFrame)
      sidebarResizeFrame = null
    }
    setSidebarWidth(pendingSidebarWidth ?? sidebarWidth.value)
    pendingSidebarWidth = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const handleShortcut = (event) => {
  const key = String(event.key || '')
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (key === 'ArrowLeft') {
      event.preventDefault()
      const entry = navigationStore.back()
      if (entry) store.navigateTo(entry)
      return
    }
    if (key === 'ArrowRight') {
      event.preventDefault()
      const entry = navigationStore.forward()
      if (entry) store.navigateTo(entry)
      return
    }
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key.toLowerCase() === 'r') {
    event.preventDefault()
    navigationStore.syncWorkspace(store.activeVault?.path)
    return
  }

  const isSearchShortcut =
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    key.toLowerCase() === 'k'

  if (!isSearchShortcut || !store.hasVault) return
  event.preventDefault()
  openSearch()
}

const handleTabSaved = (_event, tabId) => {
  const savedTab = editorStore.tabs.find((tab) => tab.id === tabId)
  if (savedTab?.pathname) {
    store.refreshSavedNote(savedTab.pathname).catch((error) => {
      console.warn('Unable to refresh ElephantNote entry after save:', error)
    })
  }
}

const refreshVisibleVaultFiles = async () => {
  if (!store.activeVault?.path) return
  try {
    const currentPath = store.currentPath || ''
    const entries = await elephantnoteClient.directory.list(currentPath)
    store.entries = Array.isArray(entries) ? entries : []
    store.rootEntries = currentPath
      ? await elephantnoteClient.directory.list('')
      : store.entries
  } catch (error) {
    console.warn('Unable to refresh the vault after synchronization:', error)
  }
}

const applyAiConfigVisibility = (config = {}) => {
  localAi.value = { ...localAi.value, ...(config.localAi || {}) }
  if (!showLocalModelLibrary.value && store.activeWorkspaceView === 'models') {
    store.setWorkspaceView('notes')
  }
}

const loadAiConfigVisibility = async () => {
  try {
    const config = await elephantnoteClient.ai.getConfig()
    applyAiConfigVisibility(config)
  } catch (error) {
    console.warn('Unable to load ElephantNote AI visibility settings:', error)
  }
}

const handleAiConfigChanged = (event) => {
  applyAiConfigVisibility(event.detail || {})
}

onMounted(() => {
  updateMobileShell()
  window.addEventListener('resize', updateMobileShell)
  window.screen?.orientation?.addEventListener?.('change', updateMobileShell)
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('elephantnote:ai-config-changed', handleAiConfigChanged)
  window.addEventListener('elephantnote:vault-files-changed', refreshVisibleVaultFiles)
  window.tauri.ipcRenderer.on('mt::tab-saved', handleTabSaved)
  setTheme(theme.value)
  const storedWidth = Number(window.localStorage.getItem('elephantnote:sidebarWidth'))
  if (storedWidth && storedWidth <= 260) {
    setSidebarWidth(storedWidth)
  } else {
    setSidebarWidth(232)
  }
  if (!preferences.autoSave) {
    preferences.SET_SINGLE_PREFERENCE({ type: 'autoSave', value: true })
  }
  store.load()
  loadAiConfigVisibility()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileShell)
  window.screen?.orientation?.removeEventListener?.('change', updateMobileShell)
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('elephantnote:ai-config-changed', handleAiConfigChanged)
  window.removeEventListener('elephantnote:vault-files-changed', refreshVisibleVaultFiles)
  if (sidebarResizeFrame) {
    window.cancelAnimationFrame(sidebarResizeFrame)
    sidebarResizeFrame = null
  }
  const ipcRenderer = window.tauri.ipcRenderer
  if (ipcRenderer.off) {
    ipcRenderer.off('mt::tab-saved', handleTabSaved)
  } else {
    ipcRenderer.removeListener?.('mt::tab-saved', handleTabSaved)
  }
})
</script>

<style scoped>
.en-shell {
  --en-bg: #0f141d;
  --en-surface: #141a24;
  --en-soft: #1b2432;
  --en-border: #283244;
  --en-border-strong: #3a465a;
  --en-text: #eef3fb;
  --en-muted: #98a3b6;
  --en-primary: #5ea1ff;
  height: 100vh;
  height: 100dvh;
  color: var(--en-text);
  background: var(--en-bg);
  overflow: hidden;
  display: flex;
  flex-direction: row;
}

.en-shell,
.en-shell :deep(*) {
  box-sizing: border-box;
}

.en-shell-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.en-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.en-body {
  flex: 1;
  display: grid;
  grid-template-columns: var(--en-sidebar-width) 1px minmax(0, 1fr);
  overflow: hidden;
}

.en-body.en-sidebar-hidden {
  grid-template-columns: 0 0 minmax(0, 1fr);
}

.en-body-main {
  grid-column: 3;
}

.en-sidebar-resizer {
  background: var(--en-border);
  cursor: col-resize;
}

.en-mobile-topbar,
.en-mobile-scrim,
.en-mobile-fab {
  display: none;
}

:global(.en-local-ai-disabled .en-rail-icon[title="Models"]) {
  display: none !important;
}

:global(.en-settings-close) {
  width: 32px !important;
  height: 32px !important;
  min-height: 32px !important;
  flex: 0 0 32px !important;
  padding: 0 !important;
  border-radius: 10px !important;
}

:global(.en-settings-close .en-icon) {
  width: 17px !important;
  height: 17px !important;
}

@media (max-width: 760px), (pointer: coarse) {
  .en-shell.en-mobile-shell {
    --en-mobile-topbar-height: 72px;
    width: 100vw;
    max-width: 100vw;
    min-height: 100dvh;
    overflow: hidden;
    touch-action: manipulation;
  }

  .en-mobile-topbar {
    min-height: calc(var(--en-mobile-topbar-height) + env(safe-area-inset-top, 0px));
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 48px;
    align-items: end;
    gap: 10px;
    padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px;
    border-bottom: 1px solid var(--en-border);
    background: var(--en-bg);
    flex: 0 0 auto;
    z-index: 30;
  }

  .en-mobile-icon-button,
  .en-mobile-search {
    min-height: 48px;
    border: 0;
    color: var(--en-text);
    background: var(--en-soft);
    font: inherit;
  }

  .en-mobile-icon-button {
    width: 48px;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .en-mobile-search {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 999px;
    padding: 0 16px;
    color: var(--en-muted);
    text-align: left;
  }

  .en-mobile-search span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .en-mobile-icon {
    width: 23px;
    height: 23px;
    flex: 0 0 auto;
  }

  .en-layout,
  .en-body,
  .en-body-main {
    min-width: 0;
    width: 100%;
  }

  .en-body,
  .en-body.en-sidebar-hidden {
    display: block;
    grid-template-columns: none;
  }

  .en-body-main {
    display: block;
    height: 100%;
  }

  .en-mobile-shell :deep(.en-sidebar) {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(82vw, 340px);
    max-width: calc(100vw - 28px);
    z-index: 50;
    border-right: 1px solid var(--en-border);
    transform: translate3d(-104%, 0, 0);
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    padding-top: env(safe-area-inset-top, 0px);
    box-shadow: 18px 0 44px rgba(0, 0, 0, 0.38);
  }

  .en-mobile-shell.en-mobile-drawer-open :deep(.en-sidebar) {
    transform: translate3d(0, 0, 0);
  }

  .en-mobile-scrim {
    position: fixed;
    inset: 0;
    display: block;
    z-index: 45;
    border: 0;
    opacity: 0;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.46);
    transition: opacity 220ms ease;
  }

  .en-mobile-scrim.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .en-mobile-fab {
    position: fixed;
    right: max(18px, env(safe-area-inset-right, 0px) + 18px);
    bottom: max(22px, env(safe-area-inset-bottom, 0px) + 22px);
    z-index: 35;
    width: 72px;
    height: 72px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 22px;
    color: #fff;
    background: var(--en-primary);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.32);
  }

  .en-mobile-fab-icon {
    width: 34px;
    height: 34px;
  }
}
</style>

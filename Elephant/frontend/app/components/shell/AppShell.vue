<template>
  <empty-vault-picker
    v-if="!store.hasVault"
    @choose="store.chooseVault"
  />
  <div
    v-else
    class="en-shell"
    :class="[
      `en-theme-${themeMode}`,
      `en-theme-${themeClassId}`,
      { 'en-pinned-card-halo': preferences.pinnedCardHalo }
    ]"
    :style="shellStyle"
  >
    <div class="en-shell-main">
      <top-vault-bar :sidebar-visible="sidebarVisible" />
      <div class="en-layout">
        <icon-rail
          :active-addon-view-id="activeAddonViewId"
          :sidebar-visible="sidebarVisible"
          @open-settings="openSettings"
          @search="openSearch"
          @toggle-sidebar="toggleSidebar"
          @open-addon-view="openAddonView"
          @close-addon-view="closeAddonView"
        />
        <div
          class="en-body"
          :class="{ 'en-sidebar-hidden': !sidebarVisible }"
        >
          <sidebar-nav
            v-if="sidebarVisible"
            :active-addon-view-id="activeAddonViewId"
            @search="openSearch"
            @open-addon-view="openAddonView"
            @close-addon-view="closeAddonView"
          />
          <div
            v-if="sidebarVisible"
            class="en-sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            @pointerdown="startResize"
          />
          <main-content
            class="en-body-main"
            :active-addon-view-id="activeAddonViewId"
            @close-addon-view="closeAddonView"
          />
        </div>
      </div>
    </div>
    <template v-for="entry in shellRightZones" :key="entry.contribution.id">
      <component
        :is="entry.contribution.component"
        v-if="isLayoutZoneVisible(entry)"
      />
    </template>
    <search-modal />
    <settings-panel
      v-if="isSettingsOpen"
      :theme="theme"
      :sidebar-width="sidebarWidth"
      :vaults="store.vaults"
      :active-vault-name="store.activeVault?.name || 'No vault'"
      :active-vault-path="store.activeVault?.path || ''"
      :initial-section="settingsInitialSection"
      @close="isSettingsOpen = false"
      @update-theme="setTheme"
      @update-sidebar-width="setSidebarWidth"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePreferencesStore } from '@/store/preferences'
import { useAddonsStore } from '@/store/addons'
import { useEditorStore } from '@/store/editor'
import { useSearchStore } from '../../stores/searchStore'
import { useCanvasStore } from '../../stores/canvasStore'
import {
  ELEPHANTNOTE_THEME_STORAGE_KEY,
  getThemeMode,
  getThemeTokens,
  normalizeThemeId
} from 'common/elephantnote/appearance'
import EmptyVaultPicker from './EmptyVaultPicker.vue'
import TopVaultBar from './TopVaultBar.vue'
import IconRail from '../navigation/IconRail.vue'
import SidebarNav from '../navigation/SidebarNav.vue'
import MainContent from './MainContent.vue'
import SettingsPanel from '../settings/SettingsPanel.vue'
import SearchModal from '../../search/SearchModal.vue'
import '../../styles/app-shell.css'

const CORE_WORKSPACE_VIEWS = new Set(['notes', 'dashboard', 'canvas'])
const store = useVaultStore()
const preferences = usePreferencesStore()
const addonsStore = useAddonsStore()
const editorStore = useEditorStore()
const searchStore = useSearchStore()
const navigationStore = useNavigationStore()
const canvasStore = useCanvasStore()
const isSettingsOpen = ref(false)
const settingsInitialSection = ref('appearance')
const activeAddonViewId = ref('')
const theme = ref(normalizeThemeId(window.localStorage.getItem(ELEPHANTNOTE_THEME_STORAGE_KEY)))
const sidebarWidth = ref(232)
const sidebarVisible = ref(true)
let sidebarResizeFrame = null
let pendingSidebarWidth = null

const activeThemeTokens = computed(() => getThemeTokens(theme.value))
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const availableAddonViewIds = computed(() => addonsStore.getContributions('views')
  .map((entry) => entry?.contribution?.id)
  .filter(Boolean))
const shellRightZones = computed(() => addonsStore.getContributions('layout.zones')
  .filter((entry) => entry?.contribution?.zone === 'shell.right' && entry?.contribution?.component)
  .sort((left, right) => Number(left.contribution.order || 0) - Number(right.contribution.order || 0)))
const shellStyle = computed(() => ({
  ...activeThemeTokens.value,
  '--en-sidebar-width': `${sidebarWidth.value}px`
}))

const isLayoutZoneVisible = (entry) => {
  const predicate = entry?.contribution?.when
  if (typeof predicate !== 'function') return true
  try {
    return predicate() === true
  } catch (error) {
    console.warn('[addons] layout visibility predicate failed', {
      id: entry?.contribution?.id || '',
      error
    })
    return false
  }
}

const applyThemeVariables = () => {
  const root = document.documentElement
  for (const [key, value] of Object.entries(activeThemeTokens.value)) {
    root.style.setProperty(key, value)
  }
  root.dataset.elephantnoteTheme = theme.value
}

const openSettings = (section = 'appearance') => {
  settingsInitialSection.value = typeof section === 'string' && section ? section : 'appearance'
  isSettingsOpen.value = true
}

const handleOpenSettingsEvent = (event) => {
  openSettings(event?.detail?.section || 'appearance')
}

const openSearch = () => {
  searchStore.open()
}

const openAddonView = (viewId) => {
  const normalized = typeof viewId === 'string' ? viewId.trim() : ''
  if (!normalized || !availableAddonViewIds.value.includes(normalized)) return
  store.closeNote()
  store.activeWorkspaceView = 'notes'
  activeAddonViewId.value = normalized
}

const handleOpenAddonViewEvent = (event) => {
  openAddonView(event?.detail?.viewId)
}

const closeAddonView = () => {
  activeAddonViewId.value = ''
}

const toggleSidebar = () => {
  sidebarVisible.value = !sidebarVisible.value
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

watch(
  () => [store.activeWorkspaceView, store.openedNotePath, store.activeVaultId],
  ([workspaceView, openedNotePath]) => {
    if (!CORE_WORKSPACE_VIEWS.has(workspaceView)) {
      store.setWorkspaceView('notes', { record: false })
      activeAddonViewId.value = ''
      return
    }
    if (openedNotePath || workspaceView !== 'notes') activeAddonViewId.value = ''
  }
)

watch(availableAddonViewIds, (ids) => {
  if (activeAddonViewId.value && !ids.includes(activeAddonViewId.value)) closeAddonView()
})

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

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('elephantnote:open-settings', handleOpenSettingsEvent)
  window.addEventListener('elephantnote:open-addon-view', handleOpenAddonViewEvent)
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
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('elephantnote:open-settings', handleOpenSettingsEvent)
  window.removeEventListener('elephantnote:open-addon-view', handleOpenAddonViewEvent)
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
</style>

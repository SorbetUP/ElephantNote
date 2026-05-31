<template>
  <empty-vault-picker
    v-if="!store.hasVault"
    @choose="store.chooseVault"
  />
  <div
    v-else
    class="en-shell"
    :class="[`en-theme-${theme}`, { 'en-pinned-card-halo': preferences.pinnedCardHalo }]"
    :style="shellStyle"
  >
    <top-vault-bar :sidebar-visible="sidebarVisible" />
    <div class="en-layout">
      <icon-rail
        @open-settings="openSettings"
        @search="openSearch"
        @toggle-sidebar="toggleSidebar"
      />
      <div
        class="en-body"
        :class="{ 'en-sidebar-hidden': !sidebarVisible }"
      >
        <sidebar-nav
          v-if="sidebarVisible"
          @search="openSearch"
        />
        <div
          v-if="sidebarVisible"
          class="en-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          @pointerdown="startResize"
        />
        <main-content class="en-body-main" />
      </div>
    </div>
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
import { useVaultStore } from '../../stores/vaultStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useSearchStore } from '../../stores/searchStore'
import { useCanvasStore } from '../../stores/canvasStore'
import EmptyVaultPicker from './EmptyVaultPicker.vue'
import TopVaultBar from './TopVaultBar.vue'
import IconRail from '../navigation/IconRail.vue'
import SidebarNav from '../navigation/SidebarNav.vue'
import MainContent from './MainContent.vue'
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
const theme = ref(window.localStorage.getItem('elephantnote:theme') || 'light')
const sidebarWidth = ref(232)
const sidebarVisible = ref(true)

const THEME_TOKENS = {
  dark: {
    '--en-bg': '#0f141d',
    '--en-surface': '#141a24',
    '--en-sidebar-bg': '#101722',
    '--en-soft': '#1b2432',
    '--en-soft-strong': '#202b3b',
    '--en-border': '#283244',
    '--en-border-strong': '#3a465a',
    '--en-text': '#eef3fb',
    '--en-muted': '#98a3b6',
    '--en-subtle': '#7f8aa0',
    '--en-primary': '#5ea1ff',
    '--en-danger': '#ff6b7a',
    '--en-card-shadow': '0 18px 44px rgba(0, 0, 0, 0.28)',
    '--themeColor': '#5ea1ff',
    '--selectionColor': 'rgba(94, 161, 255, 0.24)',
    '--deleteColor': '#ff6b7a',
    '--itemBgColor': '#1b2432',
    '--floatBgColor': '#141a24',
    '--floatHoverColor': '#202b3b',
    '--floatBorderColor': '#3a465a',
    '--floatShadow': '0 18px 44px rgba(0, 0, 0, 0.36)',
    '--editorBgColor': '#0f141d',
    '--editorColor': 'rgba(238, 243, 251, 0.88)',
    '--editorColor80': 'rgba(238, 243, 251, 0.8)',
    '--editorColor60': 'rgba(238, 243, 251, 0.62)',
    '--editorColor50': 'rgba(238, 243, 251, 0.52)',
    '--editorColor40': 'rgba(238, 243, 251, 0.42)',
    '--editorColor30': 'rgba(238, 243, 251, 0.32)',
    '--editorColor10': 'rgba(238, 243, 251, 0.12)',
    '--editorColor04': 'rgba(238, 243, 251, 0.05)',
    '--iconColor': '#98a3b6',
    '--codeBlockBgColor': '#141a24'
  },
  light: {
    '--en-bg': '#f7f9fc',
    '--en-surface': '#ffffff',
    '--en-sidebar-bg': '#edf2f7',
    '--en-soft': '#e9eff7',
    '--en-soft-strong': '#dfe7f1',
    '--en-border': '#c5cfdd',
    '--en-border-strong': '#aebacd',
    '--en-text': '#101828',
    '--en-muted': '#475467',
    '--en-subtle': '#667085',
    '--en-primary': '#2563eb',
    '--en-danger': '#dc2626',
    '--en-card-shadow': '0 30px 90px rgba(15, 23, 42, 0.16)',
    '--themeColor': '#2563eb',
    '--selectionColor': 'rgba(37, 99, 235, 0.16)',
    '--deleteColor': '#dc2626',
    '--itemBgColor': '#e9eff7',
    '--floatBgColor': '#ffffff',
    '--floatHoverColor': '#e9eff7',
    '--floatBorderColor': '#c5cfdd',
    '--floatShadow': '0 18px 44px rgba(15, 23, 42, 0.16)',
    '--editorBgColor': '#f7f9fc',
    '--editorColor': 'rgba(16, 24, 40, 0.88)',
    '--editorColor80': 'rgba(16, 24, 40, 0.8)',
    '--editorColor60': 'rgba(16, 24, 40, 0.62)',
    '--editorColor50': 'rgba(16, 24, 40, 0.52)',
    '--editorColor40': 'rgba(16, 24, 40, 0.42)',
    '--editorColor30': 'rgba(16, 24, 40, 0.32)',
    '--editorColor10': 'rgba(16, 24, 40, 0.12)',
    '--editorColor04': 'rgba(16, 24, 40, 0.05)',
    '--iconColor': '#667085',
    '--codeBlockBgColor': '#e9eff7'
  }
}

const activeThemeTokens = computed(() => THEME_TOKENS[theme.value] || THEME_TOKENS.light)
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

const setTheme = (value) => {
  const nextTheme = value === 'dark' ? 'dark' : 'light'
  theme.value = nextTheme
  window.localStorage.setItem('elephantnote:theme', nextTheme)
  applyThemeVariables()
}

watch(theme, (mode) => {
  canvasStore.setAppMode(mode)
}, { immediate: true })

provide('elephantnoteTheme', theme)
provide('setElephantnoteTheme', setTheme)

const setSidebarWidth = (value) => {
  sidebarWidth.value = Math.min(320, Math.max(184, value))
  window.localStorage.setItem('elephantnote:sidebarWidth', String(sidebarWidth.value))
}

const startResize = (event) => {
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  event.currentTarget.setPointerCapture(event.pointerId)

  const onMove = (moveEvent) => {
    setSidebarWidth(startWidth + moveEvent.clientX - startX)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
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
  window.electron.ipcRenderer.on('mt::tab-saved', handleTabSaved)
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

watch(theme, applyThemeVariables)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  const ipcRenderer = window.electron.ipcRenderer
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
  flex-direction: column;
}

.en-shell,
.en-shell :deep(*) {
  box-sizing: border-box;
}

.en-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
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
</style>

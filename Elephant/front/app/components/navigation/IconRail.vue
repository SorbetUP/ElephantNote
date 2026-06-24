<template>
  <nav
    class="en-rail"
    :class="{ 'en-rail-macos': isMac }"
  >
    <div class="en-rail-top">
      <div
        class="en-rail-vault-wrap"
        @mouseenter="showVaultMenu = true"
        @mouseleave="showVaultMenu = false"
      >
        <button
          class="en-rail-vault"
          type="button"
          :title="vaultTooltip"
          @click="openActiveVaultIconPicker"
        >
          <component
            :is="activeVaultIconComponent"
            v-if="activeVaultIconComponent"
            class="en-rail-vault-lucide"
          />
          <span
            v-else
            class="en-rail-vault-initial"
          >
            {{ vaultInitial(store.activeVault) }}
          </span>
        </button>
        <transition name="en-vault-fade">
          <div
            v-if="showVaultMenu"
            class="en-vault-menu"
            @mouseenter="showVaultMenu = true"
            @mouseleave="showVaultMenu = false"
          >
            <div class="en-vault-menu-header">
              Vaults
            </div>
            <template
              v-for="vault in store.vaults"
              :key="vault.id"
            >
              <div
                class="en-vault-menu-item"
                :class="{ active: vault.id === store.activeVaultId }"
              >
                <button
                  class="en-vault-menu-select"
                  type="button"
                  @click="switchVault(vault.id)"
                >
                  <span class="en-vault-menu-initial">
                    <component
                      :is="getVaultIconComponent(vault)"
                      v-if="getVaultIconComponent(vault)"
                      class="en-vault-menu-lucide"
                    />
                    <span v-else>{{ vaultInitial(vault) }}</span>
                  </span>
                  <span class="en-vault-menu-name">{{ vault.name }}</span>
                </button>
                <button
                  class="en-vault-menu-edit"
                  type="button"
                  title="Change vault icon"
                  @click.stop="toggleIconPicker(vault.id)"
                >
                  <Pencil class="en-vault-menu-edit-icon" />
                </button>
                <svg
                  v-if="vault.id === store.activeVaultId"
                  class="en-vault-menu-check"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div
                v-if="editingVaultId === vault.id"
                class="en-vault-icon-picker"
                @click.stop
              >
                <button
                  class="en-vault-icon-choice"
                  type="button"
                  title="Use first letter"
                  @mousedown.stop.prevent="setVaultIcon(vault.id, '')"
                  @pointerdown.stop
                  @pointerup.stop.prevent
                  @click.stop.prevent
                >
                  {{ vaultInitial(vault) }}
                </button>
                <button
                  v-for="icon in vaultIconOptions"
                  :key="icon.name"
                  class="en-vault-icon-choice"
                  :class="{ active: normalizeVaultIcon(vault.icon) === icon.name }"
                  type="button"
                  :title="icon.label"
                  @mousedown.stop.prevent="setVaultIcon(vault.id, icon.name)"
                  @pointerdown.stop
                  @pointerup.stop.prevent
                  @click.stop.prevent
                >
                  <component
                    :is="icon.component"
                    class="en-vault-icon-choice-svg"
                  />
                </button>
              </div>
            </template>
            <div class="en-vault-menu-divider" />
            <button
              class="en-vault-menu-item en-vault-menu-add"
              type="button"
              @click="addVault"
            >
              <Plus class="en-vault-menu-add-icon" />
              <span>Add another vault</span>
            </button>
          </div>
        </transition>
      </div>
    </div>

    <div class="en-rail-nav">
      <button
        class="en-rail-icon"
        type="button"
        title="Toggle sidebar"
        @click="emit('toggle-sidebar')"
      >
        <PanelLeft class="en-rail-icon-svg" />
      </button>

      <div class="en-rail-separator" />

      <button
        class="en-rail-icon"
        type="button"
        title="Dashboard"
        :class="{ active: store.activeWorkspaceView === 'dashboard' }"
        @click="store.setWorkspaceView('dashboard')"
      >
        <LayoutDashboard class="en-rail-icon-svg" />
      </button>
      <button
        class="en-rail-icon"
        type="button"
        title="Wiki"
        :class="{ active: store.activeWorkspaceView === 'wiki' }"
        @click="openWikiRoot"
      >
        <BookOpenText class="en-rail-icon-svg" />
      </button>
      <button
        class="en-rail-icon"
        type="button"
        title="Graph"
        :class="{ active: store.activeWorkspaceView === 'graph' }"
        @click="store.setWorkspaceView('graph')"
      >
        <GitFork class="en-rail-icon-svg" />
      </button>
      <button
        class="en-rail-icon"
        type="button"
        title="Calendar"
        :class="{ active: store.activeWorkspaceView === 'calendar' }"
        @click="store.setWorkspaceView('calendar')"
      >
        <CalendarDays class="en-rail-icon-svg" />
      </button>

      <div class="en-rail-separator" />

      <button
        class="en-rail-icon"
        type="button"
        title="Models"
        :class="{ active: store.activeWorkspaceView === 'models' }"
        @click="store.setWorkspaceView('models')"
      >
        <Database class="en-rail-icon-svg" />
      </button>
      <button
        class="en-rail-icon"
        type="button"
        title="Search"
        @click="emit('search')"
      >
        <Search class="en-rail-icon-svg" />
      </button>
    </div>

    <div class="en-rail-bottom">
      <button
        v-if="featureFlags.askAi"
        class="en-rail-icon"
        type="button"
        title="Chat"
        :class="{ active: store.activeWorkspaceView === 'chat' }"
        @click="handleAiClick"
      >
        <Sparkles class="en-rail-icon-svg" />
      </button>
      <button
        class="en-rail-icon"
        type="button"
        title="Settings"
        @click="emit('open-settings')"
      >
        <Settings class="en-rail-icon-svg" />
      </button>
    </div>
  </nav>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  BookOpenText,
  CalendarDays,
  Database,
  FileText,
  GitFork,
  GraduationCap,
  Home,
  LayoutDashboard,
  Landmark,
  PanelLeft,
  Pencil,
  Plus,
  Rocket,
  Search,
  Settings,
  Sparkles,
  Star,
  Terminal,
  Workflow
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  VAULT_ICON_OPTIONS,
  normalizeVaultIcon
} from 'common/elephantnote/appearance'

const emit = defineEmits(['open-settings', 'search', 'toggle-sidebar'])
const store = useVaultStore()
const WIKI_ROOT = '.elephantnote/wiki'

const featureFlags = ref({ askAi: true })
const editingVaultId = ref('')

const VAULT_ICON_COMPONENTS = {
  Database,
  FileText,
  GraduationCap,
  Home,
  Landmark,
  Rocket,
  Star,
  Terminal,
  Workflow
}

const vaultIconOptions = VAULT_ICON_OPTIONS.map((option) => ({
  ...option,
  component: VAULT_ICON_COMPONENTS[option.lucide]
})).filter((option) => option.component)

const vaultIconComponentsByName = Object.fromEntries(
  vaultIconOptions.map((option) => [option.name, option.component])
)

const isMac = navigator.platform
  ? navigator.platform.startsWith('Mac')
  : /mac/i.test(navigator.userAgent)

const showVaultMenu = ref(false)

const getVaultIconComponent = (vault) => vaultIconComponentsByName[normalizeVaultIcon(vault?.icon)] || null

const activeVaultIconComponent = computed(() => getVaultIconComponent(store.activeVault))

const vaultInitial = (vault) => {
  const name = vault?.name || '?'
  return name.charAt(0).toUpperCase()
}

const vaultTooltip = computed(() => {
  const name = store.activeVault?.name || 'No vault'
  return `${name} — hover to switch`
})

const openActiveVaultIconPicker = () => {
  showVaultMenu.value = true
  editingVaultId.value = store.activeVaultId || ''
}

const switchVault = (vaultId) => {
  store.setActiveVault(vaultId)
  showVaultMenu.value = false
}

const addVault = async () => {
  showVaultMenu.value = false
  const selected = await store.chooseVault()
  if (selected) {
    editingVaultId.value = store.activeVaultId
    showVaultMenu.value = true
  }
}

const toggleIconPicker = (vaultId) => {
  editingVaultId.value = editingVaultId.value === vaultId ? '' : vaultId
}

const setVaultIcon = async (vaultId, icon) => {
  await store.setVaultIcon(vaultId, icon)
  editingVaultId.value = ''
}

const shouldApplyWikiRootResult = (vaultId) => {
  return store.activeWorkspaceView === 'wiki' &&
    store.currentPath === WIKI_ROOT &&
    store.activeVaultId === vaultId
}

const openWikiRoot = async () => {
  const wasAlreadyInWiki = store.activeWorkspaceView === 'wiki'
  const vaultId = store.activeVaultId
  store.currentPath = WIKI_ROOT
  store.openedNotePath = ''
  store.entries = []
  store.setWorkspaceView('wiki')

  if (!wasAlreadyInWiki) return
  if (!store.activeVault?.path) {
    return
  }

  try {
    const entries = await elephantnoteClient.directory.list(WIKI_ROOT)
    if (!shouldApplyWikiRootResult(vaultId)) return
    store.entries = Array.isArray(entries) ? entries : []
  } catch {
    if (!shouldApplyWikiRootResult(vaultId)) return
    store.entries = []
  }
}

const handleAiClick = () => {
  store.toggleChatSidebar()
}

onMounted(async () => {
  try {
    featureFlags.value = await elephantnoteClient.features.get()
  } catch {
    featureFlags.value = { askAi: true }
  }
  window.addEventListener('elephantnote:feature-flags-changed', handleFeatureFlagsChanged)
})

const handleFeatureFlagsChanged = (event) => {
  featureFlags.value = { ...featureFlags.value, ...(event.detail || {}) }
}

onBeforeUnmount(() => {
  window.removeEventListener('elephantnote:feature-flags-changed', handleFeatureFlagsChanged)
})
</script>

<style scoped>
.en-rail {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--en-sidebar-bg, var(--en-bg));
  border-right: 1px solid var(--en-border);
  padding-top: 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.en-rail-macos {
  padding-top: 36px;
}

.en-rail-top {
  -webkit-app-region: no-drag;
  margin-bottom: 4px;
  position: relative;
}

.en-rail-vault-wrap {
  position: relative;
}

.en-rail-vault {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 0;
  background: var(--en-soft-strong, var(--en-soft));
  color: var(--en-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  padding: 0;
  overflow: hidden;
}

.en-rail-vault:hover {
  opacity: 0.85;
}

.en-rail-vault-initial {
  font-size: 15px;
  font-weight: 800;
}

.en-rail-vault-lucide {
  width: 19px;
  height: 19px;
  stroke-width: 2.2;
}

.en-vault-menu {
  position: absolute;
  left: 52px;
  top: -4px;
  min-width: 250px;
  background: var(--en-surface);
  border: 1px solid var(--en-border);
  border-radius: 10px;
  box-shadow: var(--en-card-shadow, 0 8px 30px rgba(0, 0, 0, 0.18));
  padding: 6px;
  z-index: 100;
  -webkit-app-region: no-drag !important;
  pointer-events: auto;
}

.en-vault-menu-header {
  padding: 6px 10px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--en-muted);
}

.en-vault-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--en-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  transition: background 0.1s;
}

.en-vault-menu-item:hover {
  background: var(--en-soft);
}

.en-vault-menu-item.active {
  background: var(--en-soft-strong, var(--en-soft));
}

.en-vault-menu-select {
  min-width: 0;
  flex: 1;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.en-vault-menu-initial {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--en-soft-strong, var(--en-soft));
  color: var(--en-text);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.en-vault-menu-lucide {
  width: 15px;
  height: 15px;
  stroke-width: 2.2;
}

.en-vault-menu-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-vault-menu-edit {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
}

.en-vault-menu-item:hover .en-vault-menu-edit,
.en-vault-menu-edit:focus-visible {
  opacity: 1;
}

.en-vault-menu-edit:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-vault-menu-edit-icon {
  width: 14px;
  height: 14px;
}

.en-vault-menu-check {
  width: 16px;
  height: 16px;
  color: var(--en-primary);
  flex-shrink: 0;
}

.en-vault-icon-picker {
  display: grid;
  grid-template-columns: repeat(5, 28px);
  gap: 5px;
  margin: 4px 4px 8px;
  padding: 8px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background: var(--en-surface);
  box-shadow: var(--en-card-shadow, 0 8px 30px rgba(0, 0, 0, 0.18));
  -webkit-app-region: no-drag !important;
  pointer-events: auto;
}

.en-vault-icon-choice {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  color: var(--en-muted);
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  -webkit-app-region: no-drag !important;
  pointer-events: auto;
}

.en-vault-icon-choice:hover,
.en-vault-icon-choice.active {
  color: var(--en-text);
  background: var(--en-soft-strong, var(--en-soft));
}

.en-vault-icon-choice-svg {
  width: 16px;
  height: 16px;
}

.en-vault-menu-divider {
  height: 1px;
  background: var(--en-border);
  margin: 4px 0;
}

.en-vault-menu-add {
  color: var(--en-muted);
}

.en-vault-menu-add:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-vault-menu-add-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.en-rail-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
  margin-top: 4px;
}

.en-rail-separator {
  width: 24px;
  height: 1px;
  background: var(--en-border);
  margin: 4px 0;
}

.en-rail-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
  padding-bottom: 8px;
}

.en-rail-icon {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
}

.en-rail-icon:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-rail-icon.active {
  color: var(--en-text);
  background: var(--en-soft-strong, var(--en-soft));
}

.en-rail-icon-svg {
  width: 18px;
  height: 18px;
}

.en-vault-fade-enter-active,
.en-vault-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.en-vault-fade-enter-from,
.en-vault-fade-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}
</style>

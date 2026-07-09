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
          <addon-row
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
          <addon-row
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

<script>
import { ChevronDown, Package, Play, Trash2 } from '@lucide/vue'

export const AddonRow = {
  name: 'AddonRow',
  components: { ChevronDown, Package, Play, Trash2 },
  props: {
    addon: { type: Object, required: true },
    actions: { type: Array, default: () => [] },
    expanded: { type: Boolean, default: false },
    busy: { type: Boolean, default: false }
  },
  emits: ['toggle-details', 'toggle-addon', 'run-action', 'uninstall'],
  methods: {
    permissionLabels(permissions) {
      if (Array.isArray(permissions)) return permissions
      if (!permissions || typeof permissions !== 'object') return []
      const labels = []
      for (const scope of permissions.notes?.read || []) labels.push(`Read ${scope}`)
      for (const scope of permissions.notes?.write || []) labels.push(`Write ${scope}`)
      for (const host of permissions.network?.hosts || []) labels.push(`HTTPS ${host}`)
      if (permissions.storage) labels.push('Private storage')
      if (permissions.commands) labels.push('Commands')
      return labels
    }
  },
  template: `
    <article class="en-addon-row" :class="{ expanded }">
      <button class="en-addon-summary" type="button" @click="$emit('toggle-details')">
        <span class="en-addon-logo"><Package aria-hidden="true" /></span>
        <span class="en-addon-copy">
          <span class="en-addon-title">
            <strong>{{ addon.manifest.name }}</strong>
            <small>v{{ addon.manifest.version }}</small>
          </span>
          <span>{{ addon.manifest.description || 'No description.' }}</span>
        </span>
        <ChevronDown class="en-addon-chevron" :class="{ rotated: expanded }" aria-hidden="true" />
      </button>

      <div class="en-addon-controls">
        <button
          class="en-switch"
          type="button"
          role="switch"
          :aria-label="\`Enable \${addon.manifest.name}\`"
          :aria-checked="addon.enabled"
          :class="{ active: addon.enabled }"
          :disabled="busy || addon.status === 'activating'"
          @click="$emit('toggle-addon')"
        ><span /></button>
      </div>

      <div v-if="expanded" class="en-addon-details">
        <div class="en-addon-details-meta">
          <code>{{ addon.manifest.id }}</code>
          <span>{{ addon.manifest.author || 'Unknown author' }}</span>
          <span>{{ addon.status }}</span>
        </div>

        <div v-if="permissionLabels(addon.manifest.permissions).length" class="en-addon-permissions">
          <span v-for="permission in permissionLabels(addon.manifest.permissions)" :key="permission">{{ permission }}</span>
        </div>

        <p v-if="addon.error" class="en-addon-error">{{ addon.error.message }}</p>

        <div v-if="actions.length" class="en-addon-commands">
          <button
            v-for="action in actions"
            :key="action.id"
            class="en-secondary-button"
            type="button"
            :disabled="busy || !addon.enabled || !action.enabled"
            @click="$emit('run-action', action)"
          >
            <Play aria-hidden="true" /> {{ action.title }}
          </button>
        </div>

        <button
          v-if="addon.manifest.source === 'external'"
          class="en-danger-link"
          type="button"
          :disabled="busy"
          @click="$emit('uninstall')"
        ><Trash2 aria-hidden="true" /> Uninstall</button>
      </div>
    </article>
  `
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, Search, ShieldAlert } from '@lucide/vue'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { useAddonsStore } from '@/store/addons'
import { AddonRow } from './AddonsSettingsPanel.vue'

const addonsStore = useAddonsStore()
const riskAccepted = ref(false)
const query = ref('')
const expandedAddonId = ref('')
const message = ref('')
const messageIsError = ref(false)

const {
  items,
  contributions,
  communityAddonsEnabled,
  communityConsentLoaded,
  operationInProgress,
  lastError
} = storeToRefs(addonsStore)

const actions = computed(() => getAddonActions(contributions.value))
const builtInAddons = computed(() => items.value.filter((addon) => addon.manifest.source !== 'external'))
const externalAddons = computed(() => items.value.filter((addon) => addon.manifest.source === 'external'))
const normalizedQuery = computed(() => query.value.toLocaleLowerCase())
const matchesQuery = (addon) => {
  if (!normalizedQuery.value) return true
  const manifest = addon.manifest || {}
  return `${manifest.name || ''} ${manifest.description || ''} ${manifest.author || ''} ${manifest.id || ''}`
    .toLocaleLowerCase()
    .includes(normalizedQuery.value)
}
const filteredBuiltInAddons = computed(() => builtInAddons.value.filter(matchesQuery))
const filteredExternalAddons = computed(() => externalAddons.value.filter(matchesQuery))
const actionsForAddon = (addonId) => actions.value.filter((action) => action.addonId === addonId)

const showMessage = (text, error = false) => {
  message.value = text
  messageIsError.value = error
}

const toggleDetails = (addonId) => {
  expandedAddonId.value = expandedAddonId.value === addonId ? '' : addonId
}

const enableCommunityAddons = async () => {
  if (!riskAccepted.value) return
  try {
    await addonsStore.setCommunityAddonsEnabled(true)
    riskAccepted.value = false
    showMessage('Community addons are available. Installed packages remain individually disabled until you enable them.')
    log.info('[settings:addons] community:enabled')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] community:enable-failed', error)
  }
}

const disableCommunityAddons = async () => {
  if (!window.confirm('Turn off community addons? Running community addons will stop, but installed packages and data will remain.')) return
  try {
    await addonsStore.setCommunityAddonsEnabled(false)
    expandedAddonId.value = ''
    showMessage('Community addons are turned off.')
    log.info('[settings:addons] community:disabled')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] community:disable-failed', error)
  }
}

const installAddonPackage = async () => {
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'ElephantNote addon', extensions: ['enaddon', 'zip'] }]
    })
    if (typeof selected !== 'string' || !selected) return
    log.info('[settings:addons] install:start', { packagePath: selected })
    const result = await addonsStore.installExternalAddon(selected)
    expandedAddonId.value = result.manifest.id
    showMessage(`Installed ${result.manifest.name}. Review its permissions, then enable it.`)
    log.info('[settings:addons] install:done', { id: result.manifest.id, packagePath: selected })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] install:failed', error)
  }
}

const toggleAddon = async (addon) => {
  const nextEnabled = !addon.enabled
  log.info('[settings:addons] toggle:start', { id: addon.manifest.id, enabled: nextEnabled })
  try {
    await addonsStore.setAddonEnabled(addon.manifest.id, nextEnabled)
    showMessage(`${addon.manifest.name} ${nextEnabled ? 'enabled' : 'disabled'}.`)
    log.info('[settings:addons] toggle:done', { id: addon.manifest.id, enabled: nextEnabled })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] toggle:failed', { id: addon.manifest.id, error })
  }
}

const uninstallAddon = async (addon) => {
  if (!window.confirm(`Uninstall ${addon.manifest.name}? Its private data will be kept.`)) return
  try {
    await addonsStore.uninstallExternalAddon(addon.manifest.id)
    if (expandedAddonId.value === addon.manifest.id) expandedAddonId.value = ''
    showMessage(`Uninstalled ${addon.manifest.name}.`)
    log.info('[settings:addons] uninstall:done', { id: addon.manifest.id })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] uninstall:failed', { id: addon.manifest.id, error })
  }
}

const runAction = async (action) => {
  log.info('[settings:addons] action:start', { id: action.id, addonId: action.addonId })
  try {
    const result = await addonsStore.runAction(action.id)
    showMessage(`${action.title} completed${result?.path ? `: ${result.path}` : '.'}`)
    log.info('[settings:addons] action:done', { id: action.id, result })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] action:failed', { id: action.id, error })
  }
}

onMounted(async () => {
  if (!communityConsentLoaded.value) await addonsStore.loadCommunityAddonsConsent()
  log.info('[settings:addons] mounted', {
    registered: items.value.map((addon) => addon.manifest.id),
    enabled: items.value.filter((addon) => addon.enabled).map((addon) => addon.manifest.id),
    communityEnabled: communityAddonsEnabled.value
  })
})
</script>

<style scoped>
.en-addons-panel { display: grid; gap: 16px; }
.en-addons-card { overflow: hidden; border: 1px solid var(--en-border, #c5cfdd); border-radius: var(--en-ui-card-radius, 14px); background: var(--en-surface, #fff); }
.en-addons-loading, .en-addons-empty { padding: 24px; color: var(--en-muted, #667085); font-size: 11.5px; text-align: center; }
.en-addons-gate { display: grid; gap: 18px; max-width: 680px; padding: 22px; }
.en-addons-gate-heading { display: flex; gap: 13px; align-items: flex-start; }
.en-addons-gate h3, .en-addons-list-section h3 { margin: 0; font-size: 13px; }
.en-addons-gate p, .en-addons-mode-row p { margin: 5px 0 0; color: var(--en-muted, #667085); font-size: 11.5px; line-height: 1.5; }
.en-addons-icon, .en-addon-logo { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-addons-icon.warning { color: #d97706; }
.en-addons-icon svg, .en-addon-logo svg { width: 17px; height: 17px; }
.en-addons-risk-check { display: flex; align-items: flex-start; gap: 9px; font-size: 11.5px; line-height: 1.45; }
.en-addons-risk-check input { margin-top: 2px; accent-color: var(--en-primary, #2563eb); }
.en-addons-gate .en-primary-button { justify-self: start; }
.en-addons-mode-row { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 13px 18px; }
.en-addons-mode-row strong { font-size: 13px; }
.en-addons-feedback { margin: 0; padding: 9px 11px; border-radius: 9px; background: color-mix(in srgb, #16a34a 9%, var(--en-surface, #fff)); color: #15803d; font-size: 11px; }
.en-addons-feedback.error { background: color-mix(in srgb, #dc2626 9%, var(--en-surface, #fff)); color: #b91c1c; }
.en-addons-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.en-addons-search { min-width: 220px; flex: 1; height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 9px; background: var(--en-surface, #fff); color: var(--en-muted, #667085); }
.en-addons-search svg { width: 15px; height: 15px; }
.en-addons-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--en-text, #101828); font: inherit; }
.en-addons-list-section { display: grid; gap: 8px; }
.en-addons-list-section > header { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
.en-addons-list-section > header span { color: var(--en-muted, #667085); font-size: 10px; }
.en-addon-row + .en-addon-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.en-addon-summary { min-width: 0; display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 11px; padding: 13px 14px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.en-addon-summary:hover { background: color-mix(in srgb, var(--en-soft, #e9eff7) 52%, transparent); }
.en-addon-copy { min-width: 0; display: grid; gap: 3px; }
.en-addon-copy > span:last-child { overflow: hidden; color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.en-addon-title { display: flex; align-items: baseline; gap: 7px; }
.en-addon-title strong { font-size: 12.5px; }
.en-addon-title small { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-chevron { width: 15px; height: 15px; color: var(--en-muted, #667085); transition: transform 140ms ease; }
.en-addon-chevron.rotated { transform: rotate(180deg); }
.en-addon-controls { display: flex; align-items: center; padding: 0 14px 0 8px; }
.en-addon-details { grid-column: 1 / -1; display: grid; gap: 10px; padding: 0 14px 14px 59px; }
.en-addon-details-meta, .en-addon-permissions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.en-addon-details-meta code, .en-addon-details-meta span, .en-addon-permissions span { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-permissions span { padding: 2px 6px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 999px; }
.en-addon-error { margin: 0; color: #b91c1c; font-size: 10.5px; }
.en-addon-commands { display: flex; flex-wrap: wrap; gap: 7px; }
.en-addon-commands button, .en-danger-link { min-height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 8px; background: var(--en-surface, #fff); color: var(--en-text, #101828); font-size: 10.5px; cursor: pointer; }
.en-addon-commands svg, .en-danger-link svg { width: 13px; height: 13px; }
.en-danger-link { justify-self: start; color: #b91c1c; }
button:disabled { opacity: 0.48; cursor: not-allowed; }
@media (max-width: 720px) {
  .en-addons-toolbar { align-items: stretch; flex-direction: column; }
  .en-addons-search { width: 100%; }
  .en-addon-details { padding-left: 14px; }
}
</style>

<template>
  <div class="en-addons-panel">
    <section class="en-addons-card en-addons-community" :class="{ enabled: communityAddonsEnabled }">
      <div class="en-addons-community-copy">
        <span class="en-addons-icon"><ShieldAlert aria-hidden="true" /></span>
        <div>
          <strong>{{ communityAddonsEnabled ? 'Community addons enabled' : 'Community addons disabled' }}</strong>
          <p>
            Third-party addons can contain bugs, modify permitted notes or transmit permitted data. ElephantNote isolates them and checks declared permissions, but cannot guarantee that every addon is safe.
          </p>
        </div>
      </div>

      <template v-if="communityConsentLoaded && !communityAddonsEnabled">
        <label class="en-addons-risk-check">
          <input v-model="riskAccepted" type="checkbox">
          <span>I understand the risk and I am responsible for the community addons I enable.</span>
        </label>
        <button class="en-danger-button" type="button" :disabled="!riskAccepted || operationInProgress" @click="enableCommunityAddons">
          Enable community addons
        </button>
      </template>

      <button
        v-else-if="communityConsentLoaded"
        class="en-secondary-button"
        type="button"
        :disabled="operationInProgress"
        @click="disableCommunityAddons"
      >
        Disable community addons
      </button>
    </section>

    <p v-if="message" class="en-addons-feedback" :class="{ error: messageIsError }">{{ message }}</p>
    <p v-if="lastError" class="en-addons-feedback error">{{ lastError }}</p>

    <section class="en-addons-summary">
      <article><strong>{{ items.length }}</strong><span>Installed</span></article>
      <article><strong>{{ enabledAddons.length }}</strong><span>Enabled</span></article>
      <article><strong>{{ externalAddons.length }}</strong><span>Community</span></article>
      <article><strong>{{ actions.length }}</strong><span>Commands</span></article>
    </section>

    <section class="en-addons-card">
      <header class="en-addons-card-header">
        <div>
          <h3>Installed addons</h3>
          <p>Built-in addons are shipped with ElephantNote. Community packages are stored in the active vault under <code>.elephantnote/addons</code>.</p>
        </div>
        <button class="en-primary-button" type="button" :disabled="operationInProgress" @click="installAddonPackage">
          <Download aria-hidden="true" /> Install from file
        </button>
      </header>

      <div v-if="items.length" class="en-addons-list">
        <article v-for="addon in items" :key="addon.manifest.id" class="en-addon-row">
          <span class="en-addon-logo"><Package aria-hidden="true" /></span>
          <div class="en-addon-copy">
            <div class="en-addon-title">
              <strong>{{ addon.manifest.name }}</strong>
              <span :class="{ external: addon.manifest.source === 'external' }">
                {{ addon.manifest.source === 'external' ? 'Community' : 'Built in' }}
              </span>
            </div>
            <code>{{ addon.manifest.id }}</code>
            <p>{{ addon.manifest.description || 'No description.' }}</p>
            <div class="en-addon-meta">
              <span>v{{ addon.manifest.version }}</span>
              <span>{{ addon.status }}</span>
              <span v-for="permission in permissionLabels(addon.manifest.permissions)" :key="permission">{{ permission }}</span>
            </div>
            <p v-if="addon.error" class="en-addon-error">{{ addon.error.message }}</p>
          </div>
          <div class="en-addon-actions">
            <button
              class="en-switch"
              type="button"
              role="switch"
              :aria-label="`Enable ${addon.manifest.name}`"
              :aria-checked="addon.enabled"
              :class="{ active: addon.enabled }"
              :disabled="operationInProgress || addon.status === 'activating' || (addon.manifest.source === 'external' && !communityAddonsEnabled)"
              @click="toggleAddon(addon)"
            ><span /></button>
            <button
              v-if="addon.manifest.source === 'external'"
              class="en-icon-button danger"
              type="button"
              title="Uninstall addon"
              :disabled="operationInProgress"
              @click="uninstallAddon(addon)"
            ><Trash2 aria-hidden="true" /></button>
          </div>
        </article>
      </div>
      <div v-else class="en-addons-empty">
        <Package aria-hidden="true" />
        <strong>No addon registered</strong>
        <span>The addon runtime is installed, but no package is available.</span>
      </div>
    </section>

    <section class="en-addons-card">
      <header class="en-addons-card-header">
        <div>
          <h3>Addon commands</h3>
          <p>Run the commands contributed by enabled addons.</p>
        </div>
      </header>
      <div v-if="actions.length" class="en-addon-command-list">
        <article v-for="action in actions" :key="`${action.addonId}:${action.id}`">
          <div>
            <strong>{{ action.title }}</strong>
            <code>{{ action.id }}</code>
            <p v-if="action.description">{{ action.description }}</p>
          </div>
          <button class="en-secondary-button" type="button" :disabled="operationInProgress || !action.enabled" @click="runAction(action)">
            <Play aria-hidden="true" /> Run
          </button>
        </article>
      </div>
      <div v-else class="en-addons-empty compact">
        <CheckCircle2 aria-hidden="true" />
        <strong>No active command</strong>
        <span>Enable an addon that contributes commands.</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { CheckCircle2, Download, Package, Play, ShieldAlert, Trash2 } from '@lucide/vue'
import { open } from '@tauri-apps/plugin-dialog'
import log from '@/platform/runtimeLogShim'
import { getAddonActions } from '@/addons'
import { useAddonsStore } from '@/store/addons'

const addonsStore = useAddonsStore()
const riskAccepted = ref(false)
const message = ref('')
const messageIsError = ref(false)

const {
  items,
  contributions,
  enabledAddons,
  externalAddons,
  communityAddonsEnabled,
  communityConsentLoaded,
  operationInProgress,
  lastError
} = storeToRefs(addonsStore)

const actions = computed(() => getAddonActions(contributions.value))

const permissionLabels = (permissions) => {
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

const showMessage = (text, error = false) => {
  message.value = text
  messageIsError.value = error
}

const enableCommunityAddons = async () => {
  if (!riskAccepted.value) return
  try {
    await addonsStore.setCommunityAddonsEnabled(true)
    riskAccepted.value = false
    showMessage('Community addons are enabled. Review each package before activating it.')
    log.info('[settings:addons] community:enabled')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] community:enable-failed', error)
  }
}

const disableCommunityAddons = async () => {
  if (!window.confirm('Disable community addons? Every running community addon will be stopped.')) return
  try {
    await addonsStore.setCommunityAddonsEnabled(false)
    showMessage('Community addons are disabled.')
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
    const result = await addonsStore.installExternalAddon(selected)
    showMessage(`Installed ${result.manifest.name}. It remains disabled until you enable it.`)
    log.info('[settings:addons] install:done', { id: result.manifest.id, packagePath: selected })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] install:failed', error)
  }
}

const toggleAddon = async (addon) => {
  try {
    await addonsStore.setAddonEnabled(addon.manifest.id, !addon.enabled)
    showMessage(`${addon.manifest.name} ${addon.enabled ? 'disabled' : 'enabled'}.`)
    log.info('[settings:addons] toggle:done', { id: addon.manifest.id, enabled: !addon.enabled })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] toggle:failed', { id: addon.manifest.id, error })
  }
}

const uninstallAddon = async (addon) => {
  if (!window.confirm(`Uninstall ${addon.manifest.name}? Its private data will be kept.`)) return
  try {
    await addonsStore.uninstallExternalAddon(addon.manifest.id)
    showMessage(`Uninstalled ${addon.manifest.name}.`)
    log.info('[settings:addons] uninstall:done', { id: addon.manifest.id })
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
    log.error('[settings:addons] uninstall:failed', { id: addon.manifest.id, error })
  }
}

const runAction = async (action) => {
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
    enabled: enabledAddons.value.map((addon) => addon.manifest.id),
    actions: actions.value.map((action) => action.id),
    communityEnabled: communityAddonsEnabled.value
  })
})
</script>

<style scoped>
.en-addons-panel { display: grid; gap: 16px; }
.en-addons-card { overflow: hidden; border: 1px solid var(--en-border, #c5cfdd); border-radius: 14px; background: var(--en-surface, #fff); }
.en-addons-community { display: grid; gap: 14px; padding: 18px; border-color: color-mix(in srgb, #dc2626 55%, var(--en-border, #c5cfdd)); background: color-mix(in srgb, #dc2626 6%, var(--en-surface, #fff)); }
.en-addons-community.enabled { border-color: color-mix(in srgb, #d97706 55%, var(--en-border, #c5cfdd)); background: color-mix(in srgb, #d97706 7%, var(--en-surface, #fff)); }
.en-addons-community-copy { display: flex; gap: 12px; align-items: flex-start; }
.en-addons-community-copy strong { font-size: 13px; }
.en-addons-community-copy p, .en-addons-card-header p, .en-addon-copy p, .en-addon-command-list p { margin: 4px 0 0; color: var(--en-muted, #667085); font-size: 11.5px; line-height: 1.45; }
.en-addons-icon, .en-addon-logo { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 10px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-addons-icon svg, .en-addon-logo svg { width: 17px; height: 17px; }
.en-addons-risk-check { display: flex; align-items: flex-start; gap: 9px; color: var(--en-text, #101828); font-size: 11.5px; line-height: 1.4; }
.en-addons-risk-check input { margin-top: 2px; accent-color: #dc2626; }
.en-addons-feedback { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, #16a34a 10%, var(--en-surface, #fff)); color: #15803d; font-size: 11.5px; }
.en-addons-feedback.error { background: color-mix(in srgb, #dc2626 10%, var(--en-surface, #fff)); color: #b91c1c; }
.en-addons-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.en-addons-summary article { display: grid; gap: 4px; padding: 13px 15px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: var(--en-surface, #fff); }
.en-addons-summary strong { font-size: 21px; line-height: 1; }
.en-addons-summary span { color: var(--en-muted, #667085); font-size: 10.5px; }
.en-addons-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding: 16px 18px; border-bottom: 1px solid var(--en-border, #c5cfdd); }
.en-addons-card-header h3 { margin: 0; font-size: 13px; }
.en-addons-card-header button, .en-addon-command-list button, .en-addons-community > button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 9px; background: var(--en-surface, #fff); color: var(--en-text, #101828); cursor: pointer; }
.en-addons-card-header button svg, .en-addon-command-list button svg { width: 14px; height: 14px; }
.en-primary-button { border-color: var(--en-primary, #2563eb) !important; background: var(--en-primary, #2563eb) !important; color: #fff !important; }
.en-danger-button { border-color: color-mix(in srgb, #dc2626 55%, var(--en-border, #c5cfdd)) !important; color: #b91c1c !important; }
.en-addons-list { display: grid; }
.en-addon-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: flex-start; gap: 12px; padding: 15px 18px; }
.en-addon-row + .en-addon-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-copy { min-width: 0; }
.en-addon-title { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.en-addon-title strong { font-size: 12.5px; }
.en-addon-title span { padding: 2px 7px; border-radius: 999px; background: var(--en-soft, #e9eff7); color: var(--en-muted, #667085); font-size: 9px; }
.en-addon-title span.external { background: color-mix(in srgb, #d97706 12%, var(--en-surface, #fff)); color: #b45309; }
.en-addon-copy > code, .en-addon-command-list code { display: block; margin-top: 3px; color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.en-addon-meta span { padding: 2px 6px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 999px; color: var(--en-muted, #667085); font-size: 9px; }
.en-addon-error { color: #b91c1c !important; }
.en-addon-actions { display: flex; align-items: center; gap: 7px; }
.en-addon-actions .en-icon-button { color: #b91c1c; }
.en-addon-command-list { display: grid; }
.en-addon-command-list article { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; }
.en-addon-command-list article + article { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-command-list strong { font-size: 12px; }
.en-addons-empty { min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 20px; color: var(--en-muted, #667085); text-align: center; }
.en-addons-empty svg { width: 24px; height: 24px; }
.en-addons-empty strong { color: var(--en-text, #101828); font-size: 12px; }
.en-addons-empty span { font-size: 10.5px; }
.en-addons-empty.compact { min-height: 90px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 720px) {
  .en-addons-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .en-addons-card-header { flex-direction: column; }
  .en-addon-row { grid-template-columns: 34px minmax(0, 1fr); }
  .en-addon-actions { grid-column: 2; justify-content: space-between; }
}
</style>

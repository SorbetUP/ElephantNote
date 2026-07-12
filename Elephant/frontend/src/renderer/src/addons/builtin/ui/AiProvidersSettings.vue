<template>
  <div class="en-ai-parent-settings">
    <nav class="en-ai-module-tabs" aria-label="AI settings">
      <button
        v-for="page in visiblePages"
        :key="page.id"
        type="button"
        :class="{ active: activeTab === page.id }"
        @click="activeTab = page.id"
      >
        <component :is="TAB_ICONS[page.icon]" aria-hidden="true" />
        {{ page.label }}
      </button>
    </nav>

    <template v-if="activeTab === AI_SETTINGS_PAGE_IDS.providers">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div>
            <h4>External API providers</h4>
            <p>Stored for features that explicitly support them. API usage is billed separately from ChatGPT subscriptions.</p>
          </div>
          <button class="secondary compact" type="button" @click="addProvider"><Plus aria-hidden="true" /> Add provider</button>
        </header>

        <div v-if="providerRows.length" class="en-provider-list">
          <article v-for="provider in providerRows" :key="provider.id" class="en-provider-row">
            <div class="en-provider-form">
              <label>
                <span>Type</span>
                <select v-model="provider.type" @change="applyProviderDefaults(provider)">
                  <option value="openai-compatible">OpenAI-compatible</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="mistral">Mistral</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                  <option value="llamacpp">llama.cpp server</option>
                </select>
              </label>
              <label><span>Name</span><input v-model.trim="provider.label" type="text"></label>
              <label class="wide"><span>Base URL</span><input v-model.trim="provider.endpoint" type="url"></label>
              <label><span>API key</span><input v-model.trim="provider.apiKey" type="password" autocomplete="off"></label>
              <label><span>Headers JSON</span><input v-model.trim="provider.headersJson" type="text" placeholder="{&quot;Header&quot;:&quot;value&quot;}"></label>
            </div>
            <div class="en-provider-footer">
              <button class="en-ai-switch small" type="button" role="switch" :aria-checked="provider.enabled" :class="{ active: provider.enabled }" @click="provider.enabled = !provider.enabled"><span /></button>
              <span>{{ provider.enabled ? 'Enabled' : 'Disabled' }}</span>
              <div class="en-ai-actions">
                <button class="secondary compact" type="button" @click="testProvider(provider)"><Activity aria-hidden="true" /> Validate config</button>
                <button class="danger compact" type="button" @click="removeProvider(provider.id)"><Trash2 aria-hidden="true" /> Remove</button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="en-ai-empty"><Server aria-hidden="true" /><span>No external API provider configured.</span></div>
      </section>

      <div class="en-addon-settings-slot" data-elephant-addon-settings-slot="ai.providers.after-external" />
      <p v-if="providerMessage" class="en-ai-feedback">{{ providerMessage }}</p>
    </template>

    <div
      v-else-if="activePage?.slot"
      :key="activePage.slot"
      class="en-ai-submodule-slot"
      :data-elephant-addon-settings-slot="activePage.slot"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, MessageCircle, Plus, ScanText, Search, Server, Trash2 } from '@lucide/vue'
import log from '@/platform/runtimeLogShim'
import { useAddonsStore } from '@/store/addons'
import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
import {
  AI_SETTINGS_PAGE_BY_ID,
  AI_SETTINGS_PAGE_IDS,
  visibleAiSettingsPages
} from '../aiSettingsRegistry'

const CACHE_KEY = 'elephantnote:ai-settings-draft'
const TAB_ICONS = Object.freeze({
  server: Server,
  'message-circle': MessageCircle,
  search: Search,
  'scan-text': ScanText
})
const providerDefaults = Object.freeze({
  'openai-compatible': { label: 'OpenAI-compatible API', endpoint: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  mistral: { label: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  ollama: { label: 'Ollama', endpoint: 'http://127.0.0.1:11434' },
  lmstudio: { label: 'LM Studio', endpoint: 'http://127.0.0.1:1234/v1' },
  llamacpp: { label: 'llama.cpp server', endpoint: 'http://127.0.0.1:8080' }
})

const addonsStore = useAddonsStore()
const activeTab = ref(AI_SETTINGS_PAGE_IDS.providers)
const currentConfig = ref(normalizeAiConfig())
const providerRows = ref([])
const providerMessage = ref('')
const hydrated = ref(false)
const dirty = ref(false)
let autosaveTimer = 0

const visiblePages = computed(() => visibleAiSettingsPages(addonsStore.getContributions('settings.sections')))
const activePage = computed(() => AI_SETTINGS_PAGE_BY_ID[activeTab.value] || AI_SETTINGS_PAGE_BY_ID.providers)

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))
const parseHeaders = (value = '') => {
  if (!String(value).trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
const stringifyHeaders = (value) => value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value) : ''
const providerSource = (provider) => provider.type === 'openai-compatible' ? 'api' : provider.type
const createProvider = (type = 'openai-compatible') => ({
  id: `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type,
  label: providerDefaults[type]?.label || 'Provider',
  endpoint: providerDefaults[type]?.endpoint || '',
  apiKey: '',
  headersJson: '',
  enabled: true
})

const applyConfig = (config = {}) => {
  const rows = Array.isArray(config.providers?.list) ? config.providers.list : []
  providerRows.value = rows.map((row) => ({
    ...createProvider(row.type || 'openai-compatible'),
    ...row,
    headersJson: stringifyHeaders(row.headers) || row.headersJson || ''
  }))
}
const buildConfig = () => ({
  ...clone(currentConfig.value),
  providers: {
    ...clone(currentConfig.value.providers || {}),
    list: providerRows.value.map((provider) => {
      const row = clone(provider)
      row.headers = parseHeaders(row.headersJson)
      delete row.headersJson
      return row
    })
  }
})

const saveConfig = async (reason = 'change') => {
  if (!hydrated.value) return
  clearTimeout(autosaveTimer)
  const payload = buildConfig()
  log.info('[ai-providers] save:start', { reason, providers: providerRows.value.length })
  try {
    const saved = await elephantnoteClient.ai.setConfig(payload)
    currentConfig.value = normalizeAiConfig(saved || payload)
    localStorage.setItem(CACHE_KEY, JSON.stringify(currentConfig.value))
    dirty.value = false
    window.dispatchEvent(new CustomEvent('elephantnote:ai-config-changed', { detail: currentConfig.value }))
    log.info('[ai-providers] save:done', { reason, providers: providerRows.value.length })
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
    log.warn('[ai-providers] save:failed', { reason, error: providerMessage.value })
  }
}
const scheduleAutosave = (reason) => {
  if (!hydrated.value) return
  dirty.value = true
  clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => saveConfig(reason), 700)
}
const addProvider = () => {
  providerRows.value.push(createProvider())
  scheduleAutosave('provider-add')
}
const removeProvider = (id) => {
  providerRows.value = providerRows.value.filter((provider) => provider.id !== id)
  scheduleAutosave('provider-remove')
}
const applyProviderDefaults = (provider) => {
  const defaults = providerDefaults[provider.type] || {}
  provider.label = defaults.label || provider.label
  provider.endpoint = defaults.endpoint || provider.endpoint
  scheduleAutosave('provider-type')
}
const testProvider = async (provider) => {
  providerMessage.value = `Validating ${provider.label}...`
  try {
    const result = await elephantnoteClient.ai.testConfig({
      preset: 'custom',
      name: provider.label,
      transport: providerSource(provider),
      endpoint: provider.endpoint,
      model: '',
      apiKey: provider.apiKey
    })
    providerMessage.value = result?.ok ? `${provider.label}: configuration accepted.` : result?.error || `${provider.label}: configuration rejected.`
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  }
}
const loadConfig = async () => {
  hydrated.value = false
  try {
    currentConfig.value = normalizeAiConfig(await elephantnoteClient.ai.getConfig())
    applyConfig(currentConfig.value)
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    hydrated.value = true
  }
}
const handleConfigChanged = (event) => {
  const next = normalizeAiConfig(event?.detail || {})
  currentConfig.value = next
  if (!dirty.value) applyConfig(next)
}

watch(visiblePages, (pages) => {
  if (!pages.some((page) => page.id === activeTab.value)) activeTab.value = AI_SETTINGS_PAGE_IDS.providers
})
watch(providerRows, () => scheduleAutosave('provider-watch'), { deep: true, flush: 'sync' })
onMounted(() => {
  window.addEventListener('elephantnote:ai-config-changed', handleConfigChanged)
  loadConfig()
})
onBeforeUnmount(() => {
  window.removeEventListener('elephantnote:ai-config-changed', handleConfigChanged)
  clearTimeout(autosaveTimer)
  if (dirty.value) void saveConfig('settings-close')
})
</script>

<style scoped>
.en-ai-parent-settings { display: grid; gap: 14px; }
.en-ai-module-tabs { display: flex; align-items: center; gap: 4px; padding: 5px; overflow-x: auto; border: 1px solid var(--en-border, #c5cfdd); border-radius: 11px; background: var(--en-soft, #e9eff7); }
.en-ai-module-tabs button { min-height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--en-muted, #667085); font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }
.en-ai-module-tabs button.active { border-color: var(--en-border, #c5cfdd); background: var(--en-surface, #fff); color: var(--en-text, #101828); box-shadow: 0 1px 4px rgba(2, 6, 23, .08); }
.en-ai-module-tabs svg { width: 14px; height: 14px; }
.en-ai-submodule-slot { min-height: 1px; }
.en-ai-card { overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); }
.en-ai-card-header, .en-provider-footer, .en-ai-actions { display: flex; align-items: center; gap: 10px; }
.en-ai-card-header { justify-content: space-between; padding: 15px 16px; border-bottom: 1px solid var(--en-border); }
h4, p { margin: 0; }
h4 { font-size: 14px; }
p { color: var(--en-muted); font-size: 12px; }
.en-provider-list { display: grid; }
.en-provider-row { padding: 14px 16px; border-top: 1px solid var(--en-border); }
.en-provider-row:first-child { border-top: 0; }
.en-provider-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-provider-form label { min-width: 0; display: grid; gap: 5px; color: var(--en-muted); font-size: 11px; }
.en-provider-form .wide { grid-column: 1 / -1; }
input, select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--en-border); border-radius: 8px; background: var(--en-surface); color: var(--en-text); padding: 8px 9px; }
button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid var(--en-border); border-radius: 9px; background: var(--en-surface); color: var(--en-text); cursor: pointer; }
button svg { width: 15px; height: 15px; }
.en-provider-footer { justify-content: space-between; margin-top: 10px; }
.en-provider-footer > span { flex: 1; color: var(--en-muted); font-size: 11px; }
.en-ai-actions { justify-content: flex-end; }
.en-ai-empty { display: flex; align-items: center; gap: 8px; padding: 16px; color: var(--en-muted); }
.en-ai-empty svg { width: 16px; height: 16px; }
.en-ai-feedback { color: var(--en-muted); font-size: 11px; }
.en-addon-settings-slot { display: contents; }
@media (max-width: 760px) {
  .en-provider-form { grid-template-columns: 1fr; }
  .en-provider-form .wide { grid-column: auto; }
}
</style>

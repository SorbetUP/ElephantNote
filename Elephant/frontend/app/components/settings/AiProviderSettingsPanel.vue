<template>
  <section class="en-ai-settings">
    <div class="en-ai-toolbar">
      <nav class="en-ai-tabs" aria-label="AI settings pages">
        <button
          v-for="page in aiPages"
          :key="page.id"
          type="button"
          :class="{ active: activePage === page.id }"
          @click="activePage = page.id"
        >
          <component :is="page.icon" aria-hidden="true" />
          <span>{{ page.label }}</span>
        </button>
      </nav>
    </div>

    <template v-if="activePage === 'provider'">
      <section class="en-ai-card">
        <div class="en-ai-setting-row">
          <span class="en-ai-row-icon"><Cpu aria-hidden="true" /></span>
          <div class="en-ai-setting-copy">
            <strong>App Local</strong>
            <span>Run downloaded GGUF models with the bundled llama.cpp runtime.</span>
          </div>
          <span class="en-ai-badge" :class="{ active: form.localAi.enabled }">
            {{ form.localAi.enabled ? `${localModels.length} models` : 'Off' }}
          </span>
          <button
            class="en-ai-switch"
            type="button"
            role="switch"
            :aria-checked="form.localAi.enabled"
            :class="{ active: form.localAi.enabled }"
            @click="toggleLocalAi"
          ><span /></button>
        </div>
      </section>

      <section v-if="addonProviders.length" class="en-ai-card">
        <header class="en-ai-card-header">
          <div>
            <h4>Addon providers</h4>
            <p>Providers contributed by enabled addons. Their connection and account settings remain inside the addon.</p>
          </div>
        </header>
        <div class="en-addon-provider-list">
          <article v-for="provider in addonProviders" :key="provider.providerId" class="en-addon-provider-row">
            <div>
              <strong>{{ provider.title }}</strong>
              <span>{{ provider.description || provider.transport || provider.providerId }}</span>
            </div>
            <button class="secondary compact" type="button" @click="openAddonProviderSettings(provider)">
              Configure addon
            </button>
          </article>
        </div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div>
            <h4>External API providers</h4>
            <p>Stored for features that explicitly support them. API usage is billed separately.</p>
          </div>
          <button class="secondary compact" type="button" @click="addProvider">
            <Plus aria-hidden="true" /> Add provider
          </button>
        </header>
        <div v-if="form.providerRows.length" class="en-provider-list">
          <article v-for="provider in form.providerRows" :key="provider.id" class="en-provider-row">
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
              <button
                class="en-ai-switch small"
                type="button"
                role="switch"
                :aria-checked="provider.enabled"
                :class="{ active: provider.enabled }"
                @click="provider.enabled = !provider.enabled"
              ><span /></button>
              <span>{{ provider.enabled ? 'Enabled' : 'Disabled' }}</span>
              <div class="en-ai-actions">
                <button class="secondary compact" type="button" @click="testProvider(provider)">
                  <Activity aria-hidden="true" /> Validate config
                </button>
                <button class="danger compact" type="button" @click="removeProvider(provider.id)">
                  <Trash2 aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="en-ai-empty"><Server aria-hidden="true" /><span>No external API provider configured.</span></div>
      </section>
      <p v-if="providerMessage" class="en-ai-feedback">{{ providerMessage }}</p>
    </template>

    <template v-else-if="activePage === 'chat'">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div><h4>Chat route</h4><p>Select the runtime used by ElephantNote chat.</p></div>
          <span class="en-ai-badge active">{{ routeProviderLabel(form.routes.chat.source) }}</span>
        </header>
        <div class="en-ai-card-body en-ai-grid">
          <label>
            <span>Provider</span>
            <select v-model="form.routes.chat.source" @change="onChatSourceChanged">
              <option value="disabled">Disabled</option>
              <option v-if="form.localAi.enabled" value="app-local">App Local</option>
              <option
                v-for="provider in enabledProviderRows"
                :key="`external-${provider.id}`"
                :value="providerSource(provider)"
              >{{ provider.label }}</option>
              <option
                v-for="provider in addonProviders"
                :key="`addon-${provider.providerId}`"
                :value="provider.providerId"
              >{{ provider.title }}</option>
              <option
                v-if="unavailableSelectedProvider"
                :value="form.routes.chat.source"
                disabled
              >Unavailable addon provider · {{ form.routes.chat.source }}</option>
            </select>
          </label>
          <label>
            <span>Model</span>
            <select v-if="form.routes.chat.source === 'app-local'" v-model="form.routes.chat.model">
              <option value="">Select a local model</option>
              <option v-for="model in localModels" :key="resolveModelId(model)" :value="resolveModelId(model)">
                {{ resolveModelName(model) }}
              </option>
            </select>
            <select v-else-if="selectedAddonProvider && selectedAddonModels.length" v-model="form.routes.chat.model">
              <option value="">Select a model</option>
              <option v-for="model in selectedAddonModels" :key="addonModelId(model)" :value="addonModelId(model)">
                {{ addonModelLabel(model) }}
              </option>
            </select>
            <input v-else v-model.trim="form.routes.chat.model" type="text" placeholder="Provider model id">
          </label>
          <label class="wide"><span>System prompt</span><textarea v-model="form.routes.chat.systemPrompt" rows="5" /></label>
        </div>
        <div class="en-ai-setting-row">
          <div class="en-ai-setting-copy">
            <strong>Retrieval-augmented answers</strong>
            <span>Include relevant ElephantNote notes in the request context.</span>
          </div>
          <button
            class="en-ai-switch"
            type="button"
            role="switch"
            :aria-checked="form.routes.chat.enableRag"
            :class="{ active: form.routes.chat.enableRag }"
            @click="form.routes.chat.enableRag = !form.routes.chat.enableRag"
          ><span /></button>
        </div>
        <details class="en-ai-advanced">
          <summary>Advanced generation settings</summary>
          <div class="en-ai-card-body en-ai-grid">
            <label><span>Temperature</span><input v-model.number="form.routes.chat.temperature" type="number" min="0" max="2" step="0.05"></label>
            <label><span>Max tokens</span><input v-model.number="form.routes.chat.maxTokens" type="number" min="1" step="128"></label>
            <label><span>Context window</span><input v-model.number="form.routes.chat.contextWindow" type="number" min="512" step="512"></label>
            <label><span>RAG notes limit</span><input v-model.number="form.routes.chat.ragTopK" type="number" min="1" max="50"></label>
          </div>
        </details>
      </section>
    </template>

    <template v-else-if="activePage === 'embedding'">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div><h4>Search and embeddings</h4><p>Configure the embedding route explicitly; no provider is inferred automatically.</p></div>
          <button class="secondary compact" type="button" :disabled="indexing" @click="rebuildEmbeddings">
            <RotateCw aria-hidden="true" />{{ indexing ? 'Rebuilding…' : 'Rebuild index' }}
          </button>
        </header>
        <div class="en-ai-card-body en-ai-grid">
          <label>
            <span>Provider</span>
            <select v-model="form.routes.embedding.source">
              <option value="disabled">Disabled</option>
              <option v-if="form.localAi.enabled" value="app-local">App Local</option>
              <option v-for="provider in enabledProviderRows" :key="provider.id" :value="providerSource(provider)">{{ provider.label }}</option>
            </select>
          </label>
          <label><span>Model</span><input v-model.trim="form.routes.embedding.model" type="text" placeholder="Embedding model id"></label>
          <label><span>Search result limit</span><input v-model.number="form.routes.embedding.searchTopK" type="number" min="1" max="100"></label>
          <label><span>Semantic threshold</span><input v-model.number="form.routes.embedding.threshold" type="number" min="0" max="1" step="0.01"></label>
        </div>
        <details class="en-ai-advanced">
          <summary>Advanced indexing settings</summary>
          <div class="en-ai-card-body en-ai-grid">
            <label><span>Chunk strategy</span><select v-model="form.routes.embedding.chunkStrategy"><option value="markdown-heading">Markdown headings</option><option value="paragraph">Paragraphs</option><option value="fixed">Fixed size</option><option value="hybrid">Hybrid</option></select></label>
            <label><span>Distance</span><select v-model="form.routes.embedding.distance"><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="euclidean">Euclidean</option></select></label>
            <label><span>Chunk size</span><input v-model.number="form.routes.embedding.chunkSize" type="number" min="64" step="64"></label>
            <label><span>Chunk overlap</span><input v-model.number="form.routes.embedding.chunkOverlap" type="number" min="0" step="16"></label>
            <label><span>Dimensions</span><input v-model.number="form.routes.embedding.dimensions" type="number" min="0"></label>
            <label><span>Debounce (ms)</span><input v-model.number="form.routes.embedding.debounceMs" type="number" min="0" step="250"></label>
          </div>
        </details>
      </section>
    </template>

    <template v-else>
      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>OCR route</h4><p>Configure a provider that explicitly supports image recognition.</p></div></header>
        <div class="en-ai-card-body en-ai-grid">
          <label>
            <span>Provider</span>
            <select v-model="form.routes.ocr.source">
              <option value="disabled">Disabled</option>
              <option v-for="provider in enabledProviderRows" :key="provider.id" :value="providerSource(provider)">{{ provider.label }}</option>
            </select>
          </label>
          <label><span>Model</span><input v-model.trim="form.routes.ocr.model" type="text" placeholder="OCR model id"></label>
          <label><span>Languages</span><input v-model.trim="form.routes.ocr.languages" type="text" placeholder="eng,fra"></label>
          <label><span>Output</span><select v-model="form.routes.ocr.output"><option value="markdown">Markdown</option><option value="plain-text">Plain text</option><option value="layout-markdown">Layout Markdown</option></select></label>
        </div>
        <details class="en-ai-advanced">
          <summary>Advanced OCR settings</summary>
          <div class="en-ai-card-body en-ai-grid">
            <label><span>Confidence threshold</span><input v-model.number="form.routes.ocr.confidenceThreshold" type="number" min="0" max="1" step="0.01"></label>
            <label><span>PDF mode</span><select v-model="form.routes.ocr.pdfMode"><option value="missing-text-only">Only pages without text</option><option value="all-pages">All pages</option><option value="skip-text-pdf">Skip text PDFs</option></select></label>
          </div>
        </details>
      </section>
    </template>

    <p v-if="autosaveMessage" class="en-ai-save-state">{{ autosaveMessage }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, Cpu, Link2, Plus, RotateCw, Server, Trash2 } from '@lucide/vue'
import log from '@/platform/runtimeLogShim'
import { useAddonsStore } from '@/store/addons'
import { normalizeAiConfig, normalizeLocalAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'
import { resolveModelId, resolveModelName } from '../views/modelsViewHelpers'

const props = defineProps({ initialPage: { type: String, default: 'provider' } })
const CACHE_KEY = 'elephantnote:ai-settings-draft'
const aiPages = Object.freeze([
  { id: 'provider', label: 'Providers', icon: Server },
  { id: 'chat', label: 'Chat', icon: Link2 },
  { id: 'embedding', label: 'Search', icon: Cpu },
  { id: 'ocr', label: 'OCR', icon: Activity }
])
const providerDefaults = Object.freeze({
  'openai-compatible': { label: 'OpenAI-compatible API', endpoint: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  mistral: { label: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  ollama: { label: 'Ollama', endpoint: 'http://127.0.0.1:11434' },
  lmstudio: { label: 'LM Studio', endpoint: 'http://127.0.0.1:1234/v1' },
  llamacpp: { label: 'llama.cpp server', endpoint: 'http://127.0.0.1:8080' }
})

const addonsStore = useAddonsStore()
const activePage = ref(aiPages.some((page) => page.id === props.initialPage) ? props.initialPage : 'provider')
const saving = ref(false)
const indexing = ref(false)
const providerMessage = ref('')
const autosaveMessage = ref('')
const currentConfig = ref(normalizeAiConfig())
const localModels = ref([])
const addonModels = ref({})
const hydrated = ref(false)
let autosaveTimer = 0

const createProvider = (type = 'openai-compatible') => ({
  id: `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type,
  label: providerDefaults[type]?.label || 'Provider',
  endpoint: providerDefaults[type]?.endpoint || '',
  apiKey: '',
  headersJson: '',
  enabled: true
})
const defaultRoute = () => ({ source: 'disabled', model: '', endpoint: '', optionsJson: '' })
const defaultForm = () => ({
  localAi: normalizeLocalAiConfig(),
  providerRows: [],
  routes: {
    chat: {
      ...defaultRoute(),
      systemPrompt: '',
      temperature: 0.2,
      maxTokens: 2048,
      contextWindow: 8192,
      ragTopK: 6,
      enableRag: true,
      enableTools: false,
      stream: true
    },
    embedding: {
      ...defaultRoute(),
      searchTopK: 20,
      threshold: 0.35,
      autoIndex: true,
      backgroundIndex: true,
      debounceMs: 1500,
      distance: 'cosine',
      dimensions: 0,
      chunkStrategy: 'markdown-heading',
      chunkSize: 700,
      chunkOverlap: 80
    },
    ocr: {
      ...defaultRoute(),
      languages: 'eng,fra',
      output: 'markdown',
      pdfMode: 'missing-text-only',
      confidenceThreshold: 0.55
    }
  }
})
const form = ref(defaultForm())

const parseJsonObject = (text = '') => {
  if (!String(text).trim()) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}
const stringifyObject = (value) => value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value) : ''
const providerSource = (provider) => provider.type === 'openai-compatible' ? 'api' : provider.type
const enabledProviderRows = computed(() => form.value.providerRows.filter((provider) => provider.enabled))
const addonProviders = computed(() => addonsStore.getContributions('ai.providers')
  .map((entry) => ({ addonId: entry.addonId, ...(entry.contribution || {}) }))
  .filter((provider) => typeof provider.providerId === 'string' && provider.providerId.trim())
  .map((provider) => ({
    ...provider,
    providerId: provider.providerId.trim(),
    title: provider.title || provider.providerId
  })))
const selectedAddonProvider = computed(() => addonProviders.value.find((provider) => provider.providerId === form.value.routes.chat.source) || null)
const selectedAddonModels = computed(() => addonModels.value[form.value.routes.chat.source] || [])
const knownChatSources = computed(() => new Set([
  'disabled',
  ...(form.value.localAi.enabled ? ['app-local'] : []),
  ...enabledProviderRows.value.map(providerSource),
  ...addonProviders.value.map((provider) => provider.providerId)
]))
const unavailableSelectedProvider = computed(() => {
  const source = form.value.routes.chat.source
  return source && source !== 'disabled' && !knownChatSources.value.has(source)
})

const addonModelId = (model) => String(model?.model || model?.id || model?.value || '')
const addonModelLabel = (model) => String(model?.displayName || model?.label || model?.model || model?.id || model?.value || '')
const addonProviderFor = (source) => addonProviders.value.find((provider) => provider.providerId === source) || null
const providerEndpoint = (source) => {
  const addon = addonProviderFor(source)
  if (addon) return addon.endpoint || ''
  return form.value.providerRows.find((row) => providerSource(row) === source)?.endpoint || ''
}
const providerTransport = (source) => addonProviderFor(source)?.transport || source
const routeProviderLabel = (source = '') => {
  if (source === 'app-local') return 'App Local'
  if (source === 'disabled' || !source) return 'Disabled'
  const addon = addonProviderFor(source)
  if (addon) return addon.title
  return form.value.providerRows.find((row) => providerSource(row) === source)?.label || source
}

const normalizeProviderRows = (config = {}) => {
  const rows = Array.isArray(config.providers?.list) ? config.providers.list : []
  return rows.map((row) => ({
    ...createProvider(row.type || 'openai-compatible'),
    ...row,
    headersJson: stringifyObject(row.headers) || row.headersJson || ''
  }))
}
const normalizeRoute = (route = {}, fallback) => ({
  ...fallback,
  ...route,
  source: route.source || route.provider || fallback.source,
  optionsJson: stringifyObject(route.options) || route.optionsJson || ''
})
const applyConfig = (config = {}) => {
  const routes = config.routes || {}
  const defaults = defaultForm()
  form.value = {
    ...defaults,
    localAi: normalizeLocalAiConfig(config.localAi),
    providerRows: normalizeProviderRows(config),
    routes: {
      chat: normalizeRoute(routes.chat, defaults.routes.chat),
      embedding: normalizeRoute(routes.embedding, defaults.routes.embedding),
      ocr: normalizeRoute(routes.ocr, defaults.routes.ocr)
    }
  }
}
const buildConfig = () => {
  const chatSource = form.value.routes.chat.source
  const transport = chatSource === 'app-local' ? 'tauri-rust' : providerTransport(chatSource)
  return {
    ...clonePlainObject(currentConfig.value),
    localAi: clonePlainObject(form.value.localAi),
    provider: transport,
    transport,
    endpoint: providerEndpoint(chatSource),
    model: form.value.routes.chat.model,
    providers: {
      ...(clonePlainObject(currentConfig.value.providers || {})),
      list: form.value.providerRows.map((provider) => ({
        ...provider,
        headers: parseJsonObject(provider.headersJson),
        headersJson: undefined
      }))
    },
    routes: {
      chat: {
        ...form.value.routes.chat,
        provider: chatSource,
        transport,
        endpoint: providerEndpoint(chatSource)
      },
      embedding: {
        ...form.value.routes.embedding,
        provider: form.value.routes.embedding.source,
        endpoint: providerEndpoint(form.value.routes.embedding.source)
      },
      ocr: {
        ...form.value.routes.ocr,
        provider: form.value.routes.ocr.source,
        endpoint: providerEndpoint(form.value.routes.ocr.source)
      }
    }
  }
}

const loadLocalModels = async () => {
  if (!form.value.localAi.enabled) {
    localModels.value = []
    return
  }
  try {
    const result = await elephantnoteClient.models.list?.()
    localModels.value = Array.isArray(result?.models) ? result.models : []
  } catch (error) {
    log.warn('[ai-settings] local-models:failed', error)
  }
}
const loadAddonModels = async (provider) => {
  if (!provider || typeof provider.getModels !== 'function') return []
  try {
    const result = await provider.getModels()
    const models = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : []
    addonModels.value = { ...addonModels.value, [provider.providerId]: models }
    return models
  } catch (error) {
    providerMessage.value = `${provider.title}: ${error instanceof Error ? error.message : String(error)}`
    addonModels.value = { ...addonModels.value, [provider.providerId]: [] }
    return []
  }
}
const openAddonProviderSettings = (provider) => {
  window.dispatchEvent(new CustomEvent('elephantnote:open-settings', {
    detail: { section: provider.settingsSection || provider.providerId }
  }))
}
const onChatSourceChanged = async () => {
  const source = form.value.routes.chat.source
  if (source === 'app-local') {
    form.value.routes.chat.model = resolveModelId(localModels.value[0]) || ''
  } else {
    const provider = addonProviderFor(source)
    if (provider) {
      const models = await loadAddonModels(provider)
      form.value.routes.chat.model = addonModelId(models.find((model) => model?.isDefault) || models[0])
    } else {
      form.value.routes.chat.model = ''
    }
  }
  scheduleAutosave('chat-source')
}
const toggleLocalAi = () => {
  form.value.localAi.enabled = !form.value.localAi.enabled
  if (!form.value.localAi.enabled && form.value.routes.chat.source === 'app-local') {
    form.value.routes.chat.source = 'disabled'
    form.value.routes.chat.model = ''
    form.value.routes.chat.modelRef = ''
  }
  loadLocalModels()
  scheduleAutosave('local-ai')
}
const addProvider = () => {
  form.value.providerRows.push(createProvider())
  scheduleAutosave('provider-add')
}
const removeProvider = (id) => {
  form.value.providerRows = form.value.providerRows.filter((provider) => provider.id !== id)
  scheduleAutosave('provider-remove')
}
const applyProviderDefaults = (provider) => {
  const defaults = providerDefaults[provider.type] || {}
  provider.label = defaults.label || provider.label
  provider.endpoint = defaults.endpoint || provider.endpoint
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
    providerMessage.value = result?.ok
      ? `${provider.label}: configuration accepted.`
      : result?.error || `${provider.label}: configuration rejected.`
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  }
}
const rebuildEmbeddings = async () => {
  indexing.value = true
  try {
    await elephantnoteClient.search.rebuild?.()
    providerMessage.value = 'Embedding rebuild started.'
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    indexing.value = false
  }
}
const saveConfig = async ({ silent = false, reason = 'manual' } = {}) => {
  if (!silent) saving.value = true
  const payload = buildConfig()
  log.info('[ai-settings] saveConfig:start', { reason })
  try {
    const saved = await elephantnoteClient.ai.setConfig(clonePlainObject(payload))
    currentConfig.value = normalizeAiConfig(saved || payload)
    localStorage.setItem(CACHE_KEY, JSON.stringify(currentConfig.value))
    autosaveMessage.value = 'Saved'
    window.dispatchEvent(new CustomEvent('elephantnote:ai-config-changed', { detail: currentConfig.value }))
  } catch (error) {
    autosaveMessage.value = 'Save failed'
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (!silent) saving.value = false
  }
}
const scheduleAutosave = (reason = 'change') => {
  if (!hydrated.value) return
  clearTimeout(autosaveTimer)
  autosaveMessage.value = 'Saving…'
  autosaveTimer = setTimeout(() => saveConfig({ silent: true, reason }), 700)
}
const loadConfig = async () => {
  hydrated.value = false
  try {
    const config = await elephantnoteClient.ai.getConfig()
    currentConfig.value = normalizeAiConfig(config)
    applyConfig(currentConfig.value)
    await loadLocalModels()
    const provider = addonProviderFor(form.value.routes.chat.source)
    if (provider) await loadAddonModels(provider)
    autosaveMessage.value = 'Saved'
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    hydrated.value = true
  }
}

watch(form, () => scheduleAutosave('form-watch'), { deep: true })
watch(() => props.initialPage, (page) => {
  if (aiPages.some((item) => item.id === page)) activePage.value = page
})
watch(() => addonProviders.value.map((provider) => provider.providerId).join('|'), async () => {
  const source = form.value.routes.chat.source
  if (source && source !== 'disabled' && !knownChatSources.value.has(source)) {
    form.value.routes.chat.source = 'disabled'
    form.value.routes.chat.model = ''
    scheduleAutosave('addon-provider-removed')
    return
  }
  const provider = addonProviderFor(source)
  if (provider && !addonModels.value[source]) await loadAddonModels(provider)
})
onMounted(loadConfig)
onBeforeUnmount(() => {
  clearTimeout(autosaveTimer)
  if (hydrated.value) saveConfig({ silent: true, reason: 'settings-close' })
})
</script>

<style scoped>
.en-ai-settings { display: grid; gap: 14px; color: var(--en-text, #101828); }
h4, p { margin: 0; }
h4 { font-size: 14px; }
p, small, .en-ai-setting-copy span, .en-addon-provider-row span { color: var(--en-muted, #667085); font-size: 12px; }
.en-ai-toolbar, .en-ai-card-header, .en-ai-setting-row, .en-provider-footer, .en-ai-actions { display: flex; align-items: center; gap: 10px; }
.en-ai-toolbar { position: sticky; top: -28px; z-index: 3; justify-content: space-between; padding: 6px; border: 1px solid var(--en-border); border-radius: 12px; background: var(--en-surface); }
.en-ai-tabs { display: flex; gap: 4px; }
button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid var(--en-border); border-radius: 9px; background: var(--en-surface); color: var(--en-text); cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
button svg { width: 15px; height: 15px; }
.en-ai-tabs button { border-color: transparent; background: transparent; color: var(--en-muted); }
.en-ai-tabs button.active { border-color: var(--en-border); background: var(--en-soft); color: var(--en-text); }
.en-ai-card { overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); }
.en-ai-card-header { justify-content: space-between; padding: 15px 16px; border-bottom: 1px solid var(--en-border); }
.en-ai-card-header > div { display: grid; gap: 4px; }
.en-ai-card-body { padding: 16px; }
.en-ai-setting-row { min-height: 66px; padding: 13px 16px; }
.en-ai-row-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft); color: var(--en-primary); }
.en-ai-row-icon svg { width: 16px; height: 16px; }
.en-ai-setting-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }
.en-ai-badge { padding: 4px 8px; border-radius: 999px; background: var(--en-soft); color: var(--en-muted); font-size: 11px; }
.en-ai-badge.active { color: var(--en-primary); }
.en-ai-grid, .en-provider-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-ai-grid label, .en-provider-form label { min-width: 0; display: grid; gap: 5px; color: var(--en-muted); font-size: 11px; }
.en-ai-grid .wide, .en-provider-form .wide { grid-column: 1 / -1; }
input, select, textarea { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--en-border); border-radius: 8px; background: var(--en-surface); color: var(--en-text); padding: 8px 9px; }
textarea { resize: vertical; }
.en-provider-list, .en-addon-provider-list { display: grid; }
.en-provider-row, .en-addon-provider-row { padding: 14px 16px; border-top: 1px solid var(--en-border); }
.en-provider-row:first-child, .en-addon-provider-row:first-child { border-top: 0; }
.en-provider-footer { justify-content: space-between; margin-top: 10px; }
.en-provider-footer > span { flex: 1; color: var(--en-muted); font-size: 11px; }
.en-addon-provider-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.en-addon-provider-row > div { min-width: 0; display: grid; gap: 3px; }
.en-ai-actions { justify-content: flex-end; }
.en-ai-empty { display: flex; align-items: center; gap: 8px; padding: 16px; color: var(--en-muted); }
.en-ai-empty svg { width: 16px; height: 16px; }
.en-ai-advanced { border-top: 1px solid var(--en-border); }
.en-ai-advanced summary { padding: 12px 16px; cursor: pointer; color: var(--en-muted); font-size: 12px; }
.en-ai-feedback, .en-ai-save-state { margin: 0; color: var(--en-muted); font-size: 11px; }
.en-ai-save-state { justify-self: end; }
.en-ai-switch { flex: 0 0 auto; }
@media (max-width: 760px) {
  .en-ai-grid, .en-provider-form { grid-template-columns: 1fr; }
  .en-ai-grid .wide, .en-provider-form .wide { grid-column: auto; }
  .en-addon-provider-row { align-items: flex-start; flex-direction: column; }
}
</style>

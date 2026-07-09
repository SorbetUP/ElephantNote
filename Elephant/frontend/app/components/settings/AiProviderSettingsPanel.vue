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
      <div class="en-ai-actions">
        <span class="en-ai-save-status">{{ autosaveMessage || 'Saved' }}</span>
        <button class="secondary compact" type="button" :disabled="loading" @click="loadConfig">
          <RotateCw aria-hidden="true" /> Refresh
        </button>
        <button class="primary compact" type="button" :disabled="saving" @click="saveConfig">
          <Save aria-hidden="true" />{{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <template v-if="activePage === 'provider'">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div>
            <h4>Codex subscription</h4>
            <p>Uses the official <code>codex app-server</code> protocol and your authenticated ChatGPT account.</p>
          </div>
          <span class="en-ai-badge" :class="{ active: codexStatus.connected, warning: !codexStatus.installed }">
            {{ codexStatusLabel }}
          </span>
        </header>
        <div class="en-ai-setting-row en-codex-row">
          <span class="en-ai-row-icon"><TerminalSquare aria-hidden="true" /></span>
          <div class="en-ai-setting-copy">
            <strong>{{ codexAccountLabel }}</strong>
            <span v-if="codexStatus.version">{{ codexStatus.version }}</span>
            <span v-if="codexStatus.account?.email">{{ codexStatus.account.email }}</span>
            <small v-if="providerMessage">{{ providerMessage }}</small>
          </div>
          <div class="en-ai-actions en-ai-actions-wrap">
            <button class="secondary" type="button" :disabled="codexBusy" @click="refreshCodex">
              <RotateCw aria-hidden="true" /> Check
            </button>
            <button
              v-if="codexStatus.connected"
              class="danger"
              type="button"
              :disabled="codexBusy"
              @click="disconnectCodex"
            >
              <Unlink aria-hidden="true" /> Disconnect
            </button>
            <button
              v-else
              class="primary"
              type="button"
              :disabled="codexBusy || !codexStatus.installed"
              @click="connectCodex"
            >
              <Link2 aria-hidden="true" /> Connect with ChatGPT
            </button>
          </div>
        </div>
        <div v-if="loginChallenge.userCode" class="en-login-challenge">
          <strong>Device code: {{ loginChallenge.userCode }}</strong>
          <button class="secondary compact" type="button" @click="openExternal(loginChallenge.verificationUrl)">
            Open authentication page
          </button>
        </div>
        <div v-if="codexRateLimit" class="en-rate-limit">
          <span>Usage</span>
          <progress max="100" :value="codexRateLimit.usedPercent || 0" />
          <strong>{{ Math.round(codexRateLimit.usedPercent || 0) }}%</strong>
          <small v-if="codexRateLimit.resetsAt">reset {{ formatReset(codexRateLimit.resetsAt) }}</small>
        </div>
      </section>

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

      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div>
            <h4>External API providers</h4>
            <p>Stored for features that explicitly support them. API usage is billed separately from ChatGPT subscriptions.</p>
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
              <label><span>Headers JSON</span><input v-model.trim="provider.headersJson" type="text" placeholder='{"Header":"value"}'></label>
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
    </template>

    <template v-else-if="activePage === 'chat'">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div><h4>Chat route</h4><p>Select the actual runtime used by ElephantNote chat.</p></div>
          <span class="en-ai-badge active">{{ routeProviderLabel(form.routes.chat.source) }}</span>
        </header>
        <div class="en-ai-card-body en-ai-grid">
          <label>
            <span>Provider</span>
            <select v-model="form.routes.chat.source" @change="onChatSourceChanged">
              <option value="disabled">Disabled</option>
              <option v-if="form.localAi.enabled" value="app-local">App Local</option>
              <option value="codex" :disabled="!codexStatus.connected">Codex subscription</option>
            </select>
          </label>
          <label>
            <span>Model</span>
            <select v-if="form.routes.chat.source === 'codex'" v-model="form.routes.chat.model">
              <option value="">Select a Codex model</option>
              <option v-for="model in codexModels" :key="model.id || model.model" :value="model.model || model.id">
                {{ model.displayName || model.model || model.id }}
              </option>
            </select>
            <select v-else-if="form.routes.chat.source === 'app-local'" v-model="form.routes.chat.model">
              <option value="">Select a local model</option>
              <option v-for="model in localModels" :key="resolveModelId(model)" :value="resolveModelId(model)">
                {{ resolveModelName(model) }}
              </option>
            </select>
            <input v-else v-model.trim="form.routes.chat.model" type="text" placeholder="Provider model id">
          </label>
          <label class="wide"><span>System prompt</span><textarea v-model="form.routes.chat.systemPrompt" rows="5"></textarea></label>
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
        <header class="en-ai-card-header"><div><h4>OCR route</h4><p>Configure OCR explicitly. Codex is not advertised as an OCR engine.</p></div></header>
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
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, Cpu, Link2, Plus, RotateCw, Save, Server, TerminalSquare, Trash2, Unlink } from '@lucide/vue'
import log from '@/platform/runtimeLogShim'
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
const activePage = ref(aiPages.some((page) => page.id === props.initialPage) ? props.initialPage : 'provider')
const loading = ref(false)
const saving = ref(false)
const indexing = ref(false)
const codexBusy = ref(false)
const providerMessage = ref('')
const autosaveMessage = ref('')
const currentConfig = ref(normalizeAiConfig())
const localModels = ref([])
const codexModels = ref([])
const codexStatus = ref({ installed: false, running: false, connected: false, account: null, version: '', error: '' })
const codexRateLimits = ref(null)
const loginChallenge = ref({})
const hydrated = ref(false)
let autosaveTimer = 0
let unlistenCodex = null

const providerDefaults = {
  'openai-compatible': { label: 'OpenAI-compatible API', endpoint: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  mistral: { label: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  ollama: { label: 'Ollama', endpoint: 'http://127.0.0.1:11434' },
  lmstudio: { label: 'LM Studio', endpoint: 'http://127.0.0.1:1234/v1' },
  llamacpp: { label: 'llama.cpp server', endpoint: 'http://127.0.0.1:8080' }
}
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
  codex: { connected: false, model: '' },
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

const invoke = (command, payload = {}) => {
  const fn = globalThis.window?.__TAURI__?.core?.invoke
  if (typeof fn !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return fn(command, payload)
}
const invokeCodex = (codexOperation, payload = {}) => invoke('tauri_rag_chat', { payload: { codexOperation, ...payload } })
const openExternal = async(url) => {
  if (!url) return
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}
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
const codexStatusLabel = computed(() => !codexStatus.value.installed ? 'Not installed' : codexStatus.value.connected ? 'Connected' : 'Disconnected')
const codexAccountLabel = computed(() => codexStatus.value.connected ? `ChatGPT ${codexStatus.value.account?.planType || 'account'}` : codexStatus.value.installed ? 'Codex CLI detected' : 'Codex CLI required')
const codexRateLimit = computed(() => codexRateLimits.value?.rateLimits?.primary || Object.values(codexRateLimits.value?.rateLimitsByLimitId || {})[0]?.primary || null)
const routeProviderLabel = (source = '') => ({ 'app-local': 'App Local', codex: 'Codex', disabled: 'Disabled' }[source] || source || 'Disabled')
const formatReset = (timestamp) => new Date(Number(timestamp) * 1000).toLocaleString()

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
  form.value = {
    ...defaultForm(),
    localAi: normalizeLocalAiConfig(config.localAi),
    providerRows: normalizeProviderRows(config),
    codex: { connected: false, model: config.providers?.codex?.model || '' },
    routes: {
      chat: normalizeRoute(routes.chat, defaultForm().routes.chat),
      embedding: normalizeRoute(routes.embedding, defaultForm().routes.embedding),
      ocr: normalizeRoute(routes.ocr, defaultForm().routes.ocr)
    }
  }
}
const providerEndpoint = (source) => form.value.providerRows.find((row) => providerSource(row) === source)?.endpoint || ''
const buildConfig = () => ({
  ...clonePlainObject(currentConfig.value),
  localAi: clonePlainObject(form.value.localAi),
  provider: form.value.routes.chat.source === 'app-local' ? 'tauri-rust' : form.value.routes.chat.source,
  transport: form.value.routes.chat.source === 'codex' ? 'codex' : form.value.routes.chat.source,
  endpoint: form.value.routes.chat.source === 'codex' ? 'codex://app-server' : providerEndpoint(form.value.routes.chat.source),
  model: form.value.routes.chat.model,
  providers: {
    list: form.value.providerRows.map((provider) => ({
      ...provider,
      headers: parseJsonObject(provider.headersJson),
      headersJson: undefined
    })),
    codex: {
      connected: codexStatus.value.connected,
      mode: 'chatgpt-app-server',
      model: form.value.routes.chat.source === 'codex' ? form.value.routes.chat.model : form.value.codex.model,
      planType: codexStatus.value.account?.planType || null
    }
  },
  routes: {
    chat: {
      ...form.value.routes.chat,
      provider: form.value.routes.chat.source,
      endpoint: form.value.routes.chat.source === 'codex' ? 'codex://app-server' : providerEndpoint(form.value.routes.chat.source)
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
})

const loadLocalModels = async() => {
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
const refreshCodex = async() => {
  codexBusy.value = true
  try {
    codexStatus.value = await invokeCodex('status')
    form.value.codex.connected = Boolean(codexStatus.value.connected)
    providerMessage.value = codexStatus.value.error || (codexStatus.value.connected
      ? 'Authenticated through Codex app-server.'
      : codexStatus.value.installed
        ? 'Codex is installed but no ChatGPT account is connected.'
        : 'Install the official Codex CLI first.')
    if (codexStatus.value.connected) {
      const models = await invokeCodex('models')
      codexModels.value = Array.isArray(models?.data) ? models.data : []
      codexRateLimits.value = await invokeCodex('rateLimits').catch(() => null)
      if (form.value.routes.chat.source === 'codex' && !form.value.routes.chat.model) {
        form.value.routes.chat.model = codexModels.value.find((model) => model.isDefault)?.model || codexModels.value[0]?.model || codexModels.value[0]?.id || ''
      }
    } else {
      codexModels.value = []
      codexRateLimits.value = null
    }
  } catch (error) {
    codexStatus.value = {
      installed: false,
      running: false,
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    }
    providerMessage.value = codexStatus.value.error
  } finally {
    codexBusy.value = false
  }
}
const connectCodex = async() => {
  codexBusy.value = true
  try {
    const challenge = await invokeCodex('login', { flow: 'browser' })
    loginChallenge.value = challenge || {}
    const url = challenge?.authUrl || challenge?.verificationUrl
    if (url) await openExternal(url)
    providerMessage.value = challenge?.userCode
      ? `Enter device code ${challenge.userCode}.`
      : 'Authentication opened in your browser.'
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    codexBusy.value = false
  }
}
const disconnectCodex = async() => {
  codexBusy.value = true
  try {
    await invokeCodex('logout')
    if (form.value.routes.chat.source === 'codex') {
      form.value.routes.chat.source = 'disabled'
      form.value.routes.chat.model = ''
    }
    await refreshCodex()
    scheduleAutosave('codex-logout')
  } finally {
    codexBusy.value = false
  }
}
const onChatSourceChanged = () => {
  if (form.value.routes.chat.source === 'codex') {
    form.value.routes.chat.model = codexModels.value.find((model) => model.isDefault)?.model || codexModels.value[0]?.model || codexModels.value[0]?.id || ''
  } else if (form.value.routes.chat.source === 'app-local') {
    form.value.routes.chat.model = resolveModelId(localModels.value[0]) || ''
  } else {
    form.value.routes.chat.model = ''
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
const testProvider = async(provider) => {
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
const rebuildEmbeddings = async() => {
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
const saveConfig = async({ silent = false, reason = 'manual' } = {}) => {
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
const loadConfig = async() => {
  hydrated.value = false
  loading.value = true
  try {
    const config = await elephantnoteClient.ai.getConfig()
    currentConfig.value = normalizeAiConfig(config)
    applyConfig(currentConfig.value)
    await Promise.all([loadLocalModels(), refreshCodex()])
    autosaveMessage.value = 'Saved'
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    hydrated.value = true
    loading.value = false
  }
}

watch(form, () => scheduleAutosave('form-watch'), { deep: true })
watch(() => props.initialPage, (page) => {
  if (aiPages.some((item) => item.id === page)) activePage.value = page
})
onMounted(async() => {
  const { listen } = await import('@tauri-apps/api/event')
  unlistenCodex = await listen('elephantnote:codex:event', (event) => {
    const method = event?.payload?.method
    if (method === 'account/login/completed' || method === 'account/updated' || method === 'account/rateLimits/updated') {
      refreshCodex()
    }
  }).catch(() => null)
  await loadConfig()
})
onBeforeUnmount(() => {
  clearTimeout(autosaveTimer)
  if (typeof unlistenCodex === 'function') unlistenCodex()
  if (hydrated.value) saveConfig({ silent: true, reason: 'settings-close' })
})
</script>

<style scoped>
.en-ai-settings { display: grid; gap: 14px; color: var(--en-text, #101828); }
h4, p { margin: 0; }
h4 { font-size: 14px; }
p, small, .en-ai-setting-copy span { color: var(--en-muted, #667085); font-size: 12px; }
.en-ai-toolbar, .en-ai-card-header, .en-ai-setting-row, .en-provider-footer, .en-ai-actions, .en-rate-limit { display: flex; align-items: center; gap: 10px; }
.en-ai-toolbar { position: sticky; top: -28px; z-index: 3; justify-content: space-between; padding: 6px; border: 1px solid var(--en-border); border-radius: 12px; background: var(--en-surface); }
.en-ai-tabs { display: flex; gap: 4px; }
button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid var(--en-border); border-radius: 9px; background: var(--en-surface); color: var(--en-text); cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
button svg { width: 14px; height: 14px; }
.en-ai-tabs button { border-color: transparent; background: transparent; color: var(--en-muted); }
.en-ai-tabs button.active { border-color: var(--en-border); background: var(--en-soft); color: var(--en-text); }
.primary { border-color: var(--en-primary); background: var(--en-primary); color: white; }
.danger { color: #b42318; }
.compact { min-height: 30px; font-size: 12px; }
.en-ai-card { overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); }
.en-ai-card-header { justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--en-border); }
.en-ai-card-header > div { display: grid; gap: 4px; }
.en-ai-card-body { padding: 16px; }
.en-ai-setting-row { min-height: 68px; padding: 12px 16px; }
.en-ai-setting-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }
.en-ai-row-icon { display: grid; place-items: center; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; background: var(--en-soft); }
.en-ai-row-icon svg { width: 16px; height: 16px; }
.en-ai-badge, .en-ai-save-status { padding: 4px 9px; border: 1px solid var(--en-border); border-radius: 99px; color: var(--en-muted); font-size: 11px; }
.en-ai-badge.active { border-color: #86efac; color: #15803d; }
.en-ai-badge.warning { border-color: #fbbf24; color: #a16207; }
.en-ai-switch { width: 42px; min-height: 24px; padding: 2px; border-radius: 99px; justify-content: flex-start; }
.en-ai-switch span { width: 18px; height: 18px; border-radius: 50%; background: var(--en-muted); transition: transform .15s; }
.en-ai-switch.active { background: var(--en-primary); }
.en-ai-switch.active span { background: white; transform: translateX(16px); }
.en-ai-switch.small { width: 36px; min-height: 22px; }
.en-ai-switch.small span { width: 16px; height: 16px; }
.en-ai-switch.small.active span { transform: translateX(14px); }
.en-codex-row { flex-wrap: wrap; }
.en-ai-actions-wrap { flex-wrap: wrap; justify-content: flex-end; }
.en-login-challenge, .en-rate-limit { margin: 0 16px 16px; padding: 10px 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }
.en-login-challenge { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.en-rate-limit progress { flex: 1; min-width: 120px; }
.en-provider-list { display: grid; }
.en-provider-row { padding: 14px 16px; border-top: 1px solid var(--en-border); }
.en-provider-row:first-child { border-top: 0; }
.en-provider-form, .en-ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-provider-footer { justify-content: flex-end; margin-top: 12px; }
.en-provider-footer > span { margin-right: auto; color: var(--en-muted); font-size: 12px; }
.en-ai-advanced { border-top: 1px solid var(--en-border); }
.en-ai-advanced summary { padding: 12px 16px; color: var(--en-muted); cursor: pointer; font-size: 12px; font-weight: 600; }
label { display: grid; gap: 6px; color: var(--en-muted); font-size: 11px; }
label.wide { grid-column: 1 / -1; }
input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--en-border); border-radius: 9px; padding: 8px 10px; background: var(--en-bg); color: var(--en-text); font: inherit; }
textarea { resize: vertical; }
.en-ai-empty { display: flex; align-items: center; gap: 10px; padding: 20px 16px; color: var(--en-muted); }
.en-ai-empty svg { width: 18px; }
code { font-family: ui-monospace, monospace; }
@media (max-width: 760px) {
  .en-ai-toolbar, .en-login-challenge { align-items: stretch; flex-direction: column; }
  .en-ai-tabs { overflow-x: auto; }
  .en-provider-form, .en-ai-grid { grid-template-columns: 1fr; }
  label.wide { grid-column: auto; }
  .en-ai-actions { flex-wrap: wrap; }
}
</style>

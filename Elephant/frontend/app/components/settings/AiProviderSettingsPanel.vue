<template>
  <section class="en-ai-settings">
    <div class="en-ai-top-actions">
      <button type="button" :disabled="loading" @click="loadConfig">{{ loading ? 'Loading...' : 'Reload' }}</button>
      <button type="button" :disabled="saving" @click="saveConfig">{{ saving ? 'Saving...' : 'Save' }}</button>
      <span>{{ autosaveMessage }}</span>
    </div>

    <nav class="en-ai-tabs" aria-label="AI settings pages">
      <button v-for="page in aiPages" :key="page.id" type="button" :class="{ active: activePage === page.id }" @click="activePage = page.id">
        {{ page.label }}
      </button>
    </nav>

    <template v-if="activePage === 'provider'">
      <section class="en-ai-block en-ai-inline-block">
        <h4>App Local</h4>
        <button type="button" :class="{ active: form.localAi.enabled }" @click="toggleLocalAi">
          {{ form.localAi.enabled ? 'Activé' : 'Désactivé' }}
        </button>
      </section>

      <section class="en-ai-block">
        <div class="en-ai-section-title">
          <h4>Providers</h4>
          <button type="button" title="Add provider" @click="addProvider">+</button>
        </div>
        <div v-if="form.providerRows.length" class="en-provider-list">
          <article v-for="provider in form.providerRows" :key="provider.id" class="en-provider-row">
            <button type="button" class="en-provider-summary" @click="provider.expanded = !provider.expanded">
              <strong>{{ provider.label || provider.type }}</strong>
              <span>{{ provider.type }}</span>
              <small>{{ provider.enabled ? 'enabled' : 'disabled' }}</small>
            </button>
            <button type="button" class="en-provider-remove" title="Remove provider" @click="removeProvider(provider.id)">−</button>
            <div v-if="provider.expanded" class="en-provider-details">
              <label><span>Type</span><select v-model="provider.type" @change="applyProviderDefaults(provider)"><option value="openai-compatible">OpenAI-compatible</option><option value="openrouter">OpenRouter</option><option value="mistral">Mistral</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="llamacpp">llama.cpp server</option><option value="atomic">Atomic</option></select></label>
              <label><span>Name</span><input v-model.trim="provider.label" type="text" placeholder="Provider name" /></label>
              <label><span>Base URL</span><input v-model.trim="provider.endpoint" type="text" placeholder="https://api.openai.com/v1" /></label>
              <label><span>API key</span><input v-model.trim="provider.apiKey" type="password" autocomplete="off" placeholder="API key" /></label>
              <label><span>Headers JSON</span><input v-model.trim="provider.headersJson" type="text" placeholder='{"Header":"value"}' /></label>
              <div class="en-ai-actions"><button type="button" :class="{ active: provider.enabled }" @click="toggleProvider(provider)">{{ provider.enabled ? 'Enabled' : 'Disabled' }}</button><button type="button" @click="testProvider(provider)">Test</button></div>
            </div>
          </article>
        </div>
        <button v-else type="button" @click="addProvider">+ Ajouter un provider</button>
      </section>

      <section class="en-ai-block en-ai-inline-block">
        <h4>Codex</h4>
        <div class="en-ai-actions">
          <button type="button" :class="{ active: form.codex.connected }" @click="connectCodex">
            {{ form.codex.connected ? 'Connecté' : 'Connexion' }}
          </button>
          <button type="button" :disabled="!form.codex.connected" @click="testCodex">Test</button>
          <span>{{ providerMessage }}</span>
        </div>
      </section>
    </template>

    <template v-else-if="activePage === 'chat'">
      <section class="en-ai-block">
        <h4>Model</h4>
        <label class="en-ai-full"><span>Chat model</span><input v-model.trim="form.routes.chat.modelRef" list="chat-model-candidates" type="text" placeholder="Type a model name" @change="applyModelChoice('chat')" /></label>
        <datalist id="chat-model-candidates"><option v-for="candidate in chatCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
        <div class="en-ai-route-summary"><span>Provider: {{ routeProviderLabel(form.routes.chat.source) }}</span><span>Model: {{ form.routes.chat.model || 'not selected' }}</span></div>
      </section>
      <section class="en-ai-block">
        <h4>Settings</h4>
        <label class="en-ai-full"><span>Prompt d'initialisation</span><textarea v-model="form.routes.chat.systemPrompt" rows="6" placeholder="System prompt for chat, RAG and agent answers." /></label>
        <div class="en-ai-grid">
          <label><span>Temperature</span><input v-model.number="form.routes.chat.temperature" type="number" min="0" max="2" step="0.05" /></label>
          <label><span>Max tokens</span><input v-model.number="form.routes.chat.maxTokens" type="number" min="1" step="128" /></label>
          <label><span>Context window</span><input v-model.number="form.routes.chat.contextWindow" type="number" min="512" step="512" /></label>
          <label><span>RAG notes limit</span><input v-model.number="form.routes.chat.ragTopK" type="number" min="1" max="50" /></label>
        </div>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.chat.enableRag }" @click="form.routes.chat.enableRag = !form.routes.chat.enableRag">{{ form.routes.chat.enableRag ? 'RAG on' : 'RAG off' }}</button><button type="button" :class="{ active: form.routes.chat.enableTools }" @click="form.routes.chat.enableTools = !form.routes.chat.enableTools">{{ form.routes.chat.enableTools ? 'Tools on' : 'Tools off' }}</button><button type="button" :class="{ active: form.routes.chat.stream }" @click="form.routes.chat.stream = !form.routes.chat.stream">{{ form.routes.chat.stream ? 'Streaming on' : 'Streaming off' }}</button></div>
      </section>
      <section class="en-ai-block en-ai-inline-block"><h4>Test</h4><div class="en-ai-actions"><button type="button" :disabled="testing" @click="testRoute('chat')">{{ testing ? 'Testing...' : 'Test chat' }}</button><span>{{ message }}</span></div></section>
    </template>

    <template v-else-if="activePage === 'embedding'">
      <section class="en-ai-block">
        <h4>Model</h4>
        <label class="en-ai-full"><span>Embedding model</span><input v-model.trim="form.routes.embedding.modelRef" list="embedding-model-candidates" type="text" placeholder="Type an embedding model name" @change="applyModelChoice('embedding')" /></label>
        <datalist id="embedding-model-candidates"><option v-for="candidate in embeddingCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
        <div class="en-ai-route-summary"><span>Provider: {{ routeProviderLabel(form.routes.embedding.source) }}</span><span>Model: {{ form.routes.embedding.model || 'not selected' }}</span></div>
      </section>
      <section class="en-ai-block"><h4>Vector settings</h4><div class="en-ai-grid"><label><span>Distance</span><select v-model="form.routes.embedding.distance"><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="euclidean">Euclidean</option></select></label><label><span>Dimensions</span><input v-model.number="form.routes.embedding.dimensions" type="number" min="0" placeholder="auto" /></label></div></section>
      <section class="en-ai-block">
        <h4>Indexing and search</h4>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.embedding.autoIndex }" @click="form.routes.embedding.autoIndex = !form.routes.embedding.autoIndex">{{ form.routes.embedding.autoIndex ? 'Auto-index new notes' : 'Manual indexing only' }}</button><button type="button" :class="{ active: form.routes.embedding.backgroundIndex }" @click="form.routes.embedding.backgroundIndex = !form.routes.embedding.backgroundIndex">{{ form.routes.embedding.backgroundIndex ? 'Background indexing' : 'No background indexing' }}</button></div>
        <div class="en-ai-grid"><label><span>Debounce after edit (ms)</span><input v-model.number="form.routes.embedding.debounceMs" type="number" min="0" step="250" /></label><label><span>Chunk strategy</span><select v-model="form.routes.embedding.chunkStrategy"><option value="markdown-heading">Markdown headings</option><option value="paragraph">Paragraphs</option><option value="fixed">Fixed size</option><option value="hybrid">Hybrid</option></select></label><label><span>Chunk size</span><input v-model.number="form.routes.embedding.chunkSize" type="number" min="64" step="64" /></label><label><span>Chunk overlap</span><input v-model.number="form.routes.embedding.chunkOverlap" type="number" min="0" step="16" /></label><label><span>Search top K</span><input v-model.number="form.routes.embedding.searchTopK" type="number" min="1" max="100" /></label><label><span>Semantic threshold</span><input v-model.number="form.routes.embedding.threshold" type="number" min="0" max="1" step="0.01" /></label><label><span>Semantic weight</span><input v-model.number="form.routes.embedding.semanticWeight" type="number" min="0" max="1" step="0.05" /></label><label><span>Lexical weight</span><input v-model.number="form.routes.embedding.lexicalWeight" type="number" min="0" max="1" step="0.05" /></label></div>
        <div class="en-ai-actions"><button type="button" :disabled="indexing" @click="rebuildEmbeddings">{{ indexing ? 'Rebuilding...' : 'Rebuild embedding base' }}</button><button type="button" @click="loadSearchStatus">Refresh status</button><button type="button" :disabled="testing" @click="testRoute('embedding')">Test</button><span>{{ embeddingMessage }}</span></div>
      </section>
    </template>

    <template v-else-if="activePage === 'ocr'">
      <section class="en-ai-block">
        <h4>Model</h4>
        <label class="en-ai-full"><span>OCR model</span><input v-model.trim="form.routes.ocr.modelRef" list="ocr-model-candidates" type="text" placeholder="Type an OCR model name" @change="applyModelChoice('ocr')" /></label>
        <datalist id="ocr-model-candidates"><option v-for="candidate in ocrCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
        <div class="en-ai-route-summary"><span>Provider: {{ routeProviderLabel(form.routes.ocr.source) }}</span><span>Model: {{ form.routes.ocr.model || 'not selected' }}</span></div>
      </section>
      <section class="en-ai-block">
        <h4>OCR settings</h4>
        <div class="en-ai-grid"><label><span>Languages</span><input v-model.trim="form.routes.ocr.languages" type="text" placeholder="eng,fra,heb" /></label><label><span>PDF mode</span><select v-model="form.routes.ocr.pdfMode"><option value="missing-text-only">Only pages without text</option><option value="all-pages">All pages</option><option value="skip-text-pdf">Skip text PDFs</option></select></label><label><span>Output format</span><select v-model="form.routes.ocr.output"><option value="markdown">Markdown</option><option value="plain-text">Plain text</option><option value="layout-markdown">Layout Markdown</option></select></label><label><span>Confidence threshold</span><input v-model.number="form.routes.ocr.confidenceThreshold" type="number" min="0" max="1" step="0.01" /></label></div>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.ocr.autoOcr }" @click="form.routes.ocr.autoOcr = !form.routes.ocr.autoOcr">{{ form.routes.ocr.autoOcr ? 'Auto OCR new images' : 'Manual OCR only' }}</button><button type="button" :class="{ active: form.routes.ocr.deskew }" @click="form.routes.ocr.deskew = !form.routes.ocr.deskew">Deskew</button><button type="button" :class="{ active: form.routes.ocr.denoise }" @click="form.routes.ocr.denoise = !form.routes.ocr.denoise">Denoise</button><button type="button" :class="{ active: form.routes.ocr.upscale }" @click="form.routes.ocr.upscale = !form.routes.ocr.upscale">Upscale</button><button type="button" :disabled="testing" @click="testRoute('ocr')">Test</button><span>{{ message }}</span></div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import log from '@/platform/runtimeLogShim'
import { normalizeAiConfig, normalizeLocalAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'
import { getModelCapabilities, resolveModelId, resolveModelName } from '../views/modelsViewHelpers'

const CACHE_KEY = 'elephantnote:ai-settings-draft'
const aiPages = Object.freeze([{ id: 'provider', label: 'Provider' }, { id: 'chat', label: 'Chat' }, { id: 'embedding', label: 'Embedding' }, { id: 'ocr', label: 'OCR' }])
const activePage = ref('provider')
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const indexing = ref(false)
const message = ref('')
const embeddingMessage = ref('')
const providerMessage = ref('')
const autosaveMessage = ref('')
const currentConfig = ref(normalizeAiConfig())
const localSelection = ref({ embedding: '', chat: '', ocr: '' })
const localModels = ref([])
const hydrated = ref(false)
const persisting = ref(false)
let autosaveTimer = 0

const providerDefaults = { 'openai-compatible': { label: 'OpenAI-compatible API', endpoint: 'https://api.openai.com/v1' }, openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' }, mistral: { label: 'Mistral', endpoint: 'https://api.mistral.ai/v1' }, ollama: { label: 'Ollama', endpoint: 'http://127.0.0.1:11434' }, lmstudio: { label: 'LM Studio', endpoint: 'http://127.0.0.1:1234/v1' }, llamacpp: { label: 'llama.cpp server', endpoint: 'http://127.0.0.1:8080' }, atomic: { label: 'Atomic', endpoint: '' } }
const createProvider = (type = 'openai-compatible') => ({ id: `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`, type, label: providerDefaults[type]?.label || 'Provider', endpoint: providerDefaults[type]?.endpoint || '', apiKey: '', headersJson: '', enabled: true, expanded: true })
const defaultRoute = () => ({ source: 'disabled', model: '', modelRef: '', endpoint: '', optionsJson: '' })
const defaultChatRoute = () => ({ ...defaultRoute(), systemPrompt: '', temperature: 0.2, maxTokens: 2048, contextWindow: 8192, ragTopK: 6, enableRag: true, enableTools: true, stream: true })
const defaultEmbeddingRoute = () => ({ ...defaultRoute(), autoIndex: true, backgroundIndex: true, debounceMs: 1500, distance: 'cosine', dimensions: 0, chunkStrategy: 'markdown-heading', chunkSize: 700, chunkOverlap: 80, searchTopK: 20, threshold: 0.35, semanticWeight: 0.75, lexicalWeight: 0.25 })
const defaultOcrRoute = () => ({ ...defaultRoute(), languages: 'eng,fra', pdfMode: 'missing-text-only', autoOcr: false, deskew: true, denoise: true, upscale: false, output: 'markdown', confidenceThreshold: 0.55 })
const defaultForm = () => ({ localAi: normalizeLocalAiConfig(), providerRows: [], codex: { connected: false, accountMode: true, model: '' }, routes: { chat: defaultChatRoute(), embedding: defaultEmbeddingRoute(), ocr: defaultOcrRoute() } })
const form = ref(defaultForm())

const routeProviderLabel = (source = '') => ({ 'app-local': 'App Local', api: 'API', openrouter: 'OpenRouter', mistral: 'Mistral', codex: 'Codex', ollama: 'Ollama', lmstudio: 'LM Studio', llamacpp: 'llama.cpp', atomic: 'Atomic', disabled: 'Disabled' }[source] || source || 'Disabled')
const commonExternalCandidates = computed(() => {
  const rows = form.value.providerRows.filter((provider) => provider.enabled)
  const providerCandidates = rows.flatMap((provider) => {
    const type = provider.type === 'openai-compatible' ? 'api' : provider.type
    const prefix = provider.label || routeProviderLabel(type)
    if (['ollama', 'lmstudio', 'llamacpp', 'atomic'].includes(type)) return []
    const chatModel = type === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : type === 'mistral' ? 'mistral-small-latest' : 'gpt-4.1-mini'
    const embeddingModel = type === 'mistral' ? 'mistral-embed' : 'text-embedding-3-small'
    const ocrModel = type === 'mistral' ? 'mistral-ocr-latest' : 'vision-ocr'
    return [{ ref: `${prefix} - ${chatModel}`, label: `${prefix} - ${chatModel}`, source: type, model: chatModel, caps: ['chat'] }, { ref: `${prefix} - ${embeddingModel}`, label: `${prefix} - ${embeddingModel}`, source: type, model: embeddingModel, caps: ['embedding'] }, { ref: `${prefix} - ${ocrModel}`, label: `${prefix} - ${ocrModel}`, source: type, model: ocrModel, caps: ['ocr'] }]
  })
  const codex = form.value.codex.connected ? [{ ref: 'Codex - gpt-5.1-codex', label: 'Codex - gpt-5.1-codex', source: 'codex', model: 'gpt-5.1-codex', caps: ['chat'] }] : []
  return [...providerCandidates, ...codex, { ref: 'Ollama - nomic-embed-text', label: 'Ollama - nomic-embed-text', source: 'ollama', model: 'nomic-embed-text', caps: ['embedding'] }, { ref: 'Mistral - mistral-ocr-latest', label: 'Mistral - mistral-ocr-latest', source: 'mistral', model: 'mistral-ocr-latest', caps: ['ocr'] }, { ref: 'Local OCR - tesseract-local', label: 'Local OCR - tesseract-local', source: 'local-ocr', model: 'tesseract-local', caps: ['ocr'] }]
})
const localCandidates = computed(() => form.value.localAi.enabled ? localModels.value.map((model) => ({ ref: `App Local - ${resolveModelName(model)}`, label: `App Local - ${resolveModelName(model)}`, source: 'app-local', model: resolveModelId(model), caps: getModelCapabilities(model).map((cap) => String(cap).toLowerCase()) })) : [])
const allCandidates = computed(() => [...localCandidates.value, ...commonExternalCandidates.value])
const candidatesFor = (capability) => allCandidates.value.filter((candidate) => candidate.caps.includes(capability) || (capability === 'chat' && candidate.caps.length === 0))
const chatCandidates = computed(() => candidatesFor('chat'))
const embeddingCandidates = computed(() => candidatesFor('embedding'))
const ocrCandidates = computed(() => candidatesFor('ocr'))

const parseJsonObject = (text = '') => { if (!String(text).trim()) return {}; try { const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch (error) { log.warn('[ai-settings] invalid-json', error); return {} } }
const stringifyOptions = (value) => value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value) : ''
const sanitizeProvider = (provider) => ({ ...provider, headers: parseJsonObject(provider.headersJson), headersJson: undefined, expanded: undefined })
const normalizeProviderRows = (config = {}) => {
  const rows = Array.isArray(config.providerRows) ? config.providerRows : Array.isArray(config.providers?.list) ? config.providers.list : []
  if (rows.length) return rows.map((row) => ({ ...createProvider(row.type || 'openai-compatible'), ...row, headersJson: stringifyOptions(row.headers) || row.headersJson || '', expanded: false }))
  const compatibilityProviders = config.providers || {}
  return Object.entries(compatibilityProviders).filter(([key, value]) => value?.endpoint && !['codex', 'pi'].includes(key)).map(([key, value]) => ({ ...createProvider(key === 'api' ? 'openai-compatible' : key), ...value, id: `provider-${key}`, type: key === 'api' ? 'openai-compatible' : key, label: value.label || value.name || providerDefaults[key]?.label || key, headersJson: stringifyOptions(value.headers) || value.headersJson || '', expanded: false }))
}
const normalizeBaseRoute = (route = {}, fallback = defaultRoute()) => ({ ...fallback, ...route, modelRef: route.modelRef || route.displayName || (route.model ? `${routeProviderLabel(route.source || route.provider)} - ${route.model}` : ''), source: route.source || route.provider || fallback.source, optionsJson: stringifyOptions(route.options) || route.optionsJson || '' })
const routePayload = (route = {}) => ({ ...route, provider: route.source, options: parseJsonObject(route.optionsJson), optionsJson: undefined })
const primaryEndpoint = (source) => { const provider = form.value.providerRows.find((row) => row.type === source || (source === 'api' && row.type === 'openai-compatible')); return provider?.endpoint || (source === 'codex' ? 'codex://account' : source === 'app-local' ? 'tauri-rust://local' : '') }
const sourceTransport = (source = '') => ['api', 'openrouter', 'mistral', 'lmstudio'].includes(source) ? 'openai-compatible' : source === 'app-local' ? 'tauri-rust' : source
const runtimeTestPayload = ({ source = '', endpoint = '', model = '', apiKey = '', label = '' } = {}) => ({ preset: source === 'app-local' ? 'tauriRustLocal' : source === 'codex' ? 'codex' : 'custom', name: label || routeProviderLabel(source), transport: sourceTransport(source), endpoint: endpoint || primaryEndpoint(source), model: model || '', apiKey: apiKey || '', codexLinkEnabled: form.value.codex.connected !== false })
const readCachedConfig = () => { try { const raw = window.localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null } catch { return null } }
const writeCachedConfig = (config) => { try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(config)) } catch (error) { log.warn('[ai-settings] cache-write:failed', error) } }
const hasExtendedConfig = (config = {}) => Boolean(config.localAi || config.providers?.list || Object.keys(config.routes || {}).length)
const mergeCachedConfig = (config = {}) => { const cached = readCachedConfig(); return cached && !hasExtendedConfig(config) ? { ...config, ...cached } : config }
const applyConfig = (config = {}) => { log.info('[ai-settings] applyConfig:start', { keys: Object.keys(config || {}) }); const merged = mergeCachedConfig(config); const routes = merged.routes || {}; form.value = { ...defaultForm(), localAi: normalizeLocalAiConfig(merged.localAi), providerRows: normalizeProviderRows(merged), codex: { connected: Boolean(merged.providers?.codex?.connected || merged.codex?.connected), accountMode: true, model: merged.providers?.codex?.model || merged.codex?.model || '' }, routes: { chat: normalizeBaseRoute(routes.chat, defaultChatRoute()), embedding: normalizeBaseRoute(routes.embedding, defaultEmbeddingRoute()), ocr: normalizeBaseRoute(routes.ocr, defaultOcrRoute()) } }; log.info('[ai-settings] applyConfig:done', { localAi: form.value.localAi, providers: form.value.providerRows.length, routes: form.value.routes }) }
const buildConfig = () => { const chatRoute = form.value.routes.chat; const provider = chatRoute.source === 'app-local' ? 'tauri-rust' : chatRoute.source; const providersList = form.value.providerRows.map(sanitizeProvider); return normalizeAiConfig({ ...clonePlainObject(currentConfig.value), localAi: clonePlainObject(form.value.localAi), provider, transport: sourceTransport(chatRoute.source), endpoint: chatRoute.endpoint || primaryEndpoint(chatRoute.source), model: chatRoute.model, providers: { list: providersList, codex: { connected: form.value.codex.connected, mode: 'account', model: form.value.codex.model } }, routes: { chat: routePayload(form.value.routes.chat), embedding: routePayload(form.value.routes.embedding), ocr: routePayload(form.value.routes.ocr) }, localModelSelection: clonePlainObject(localSelection.value) }) }
const loadLocalSelection = async () => { try { localSelection.value = { embedding: '', chat: '', ocr: '', ...(await elephantnoteClient.models.getSelection?.()) }; log.info('[ai-settings] local-selection:loaded', localSelection.value) } catch (error) { log.warn('[ai-settings] local-selection:failed', error) } }
const loadLocalModels = async () => { if (!form.value.localAi.enabled) { localModels.value = []; return } try { const result = await elephantnoteClient.models.list?.(); localModels.value = Array.isArray(result?.models) ? result.models : []; log.info('[ai-settings] local-models:loaded', { count: localModels.value.length }) } catch (error) { log.warn('[ai-settings] local-models:failed', error) } }
const dispatchAiConfigChanged = (config) => window.dispatchEvent(new CustomEvent('elephantnote:ai-config-changed', { detail: config }))
const scheduleAutosave = (reason = 'change') => { if (!hydrated.value || loading.value) return; window.clearTimeout(autosaveTimer); autosaveMessage.value = 'Saving...'; autosaveTimer = window.setTimeout(() => saveConfig({ silent: true, reason }), 650) }
const toggleLocalAi = () => { form.value.localAi.enabled = !form.value.localAi.enabled; form.value.localAi.showModelLibraryInSidebar = form.value.localAi.enabled; if (!form.value.localAi.enabled) { for (const route of Object.values(form.value.routes)) if (route.source === 'app-local') { route.source = 'disabled'; route.model = ''; route.modelRef = '' } } const config = buildConfig(); dispatchAiConfigChanged(config); log.info('[ai-settings] local-ai:toggled', form.value.localAi); loadLocalModels(); scheduleAutosave('local-ai-toggle') }
const applyProviderDefaults = (provider) => { const defaults = providerDefaults[provider.type] || {}; provider.label = provider.label || defaults.label || 'Provider'; provider.endpoint = provider.endpoint || defaults.endpoint || ''; log.info('[ai-settings] provider:type-changed', { id: provider.id, type: provider.type }) }
const addProvider = () => { const provider = createProvider(); form.value.providerRows.push(provider); log.info('[ai-settings] provider:add', provider); scheduleAutosave('provider-add') }
const removeProvider = (id) => { form.value.providerRows = form.value.providerRows.filter((provider) => provider.id !== id); log.info('[ai-settings] provider:remove', { id }); scheduleAutosave('provider-remove') }
const toggleProvider = (provider) => { provider.enabled = !provider.enabled; log.info('[ai-settings] provider:toggle', { id: provider.id, enabled: provider.enabled }); scheduleAutosave('provider-toggle') }
const connectCodex = () => { form.value.codex.connected = !form.value.codex.connected; log.info('[ai-settings] codex:connection-toggle', form.value.codex); providerMessage.value = form.value.codex.connected ? 'Codex connecté.' : 'Codex déconnecté.'; scheduleAutosave('codex-toggle') }
const applyModelChoice = (routeName) => { const route = form.value.routes[routeName]; const candidate = allCandidates.value.find((item) => item.ref === route.modelRef); if (candidate) { route.source = candidate.source; route.model = candidate.model; log.info('[ai-settings] model-choice:matched', { routeName, candidate }) } else { route.model = route.modelRef; if (!route.source || route.source === 'disabled') route.source = form.value.localAi.enabled ? 'app-local' : 'api'; log.info('[ai-settings] model-choice:manual', { routeName, source: route.source, model: route.model }) } scheduleAutosave(`model-choice-${routeName}`) }
const loadConfig = async () => { hydrated.value = false; loading.value = true; message.value = 'Loading AI config...'; log.info('[ai-settings] loadConfig:start'); try { await loadLocalSelection(); const config = await elephantnoteClient.ai.getConfig(); currentConfig.value = normalizeAiConfig(config); applyConfig(currentConfig.value); await loadLocalModels(); dispatchAiConfigChanged(buildConfig()); message.value = 'AI config loaded.'; log.info('[ai-settings] loadConfig:done', { localAi: form.value.localAi, routes: form.value.routes }) } catch (error) { log.error('[ai-settings] loadConfig:failed', error); applyConfig(readCachedConfig() || {}); message.value = error instanceof Error ? error.message : 'Unable to load AI config.' } finally { hydrated.value = true; loading.value = false } }
const saveConfig = async ({ silent = false, reason = 'manual' } = {}) => { if (persisting.value) return; persisting.value = true; if (!silent) saving.value = true; const payload = buildConfig(); writeCachedConfig(payload); if (!silent) message.value = 'Saving AI config...'; log.info('[ai-settings] saveConfig:start', { reason, localAi: payload.localAi, provider: payload.provider, routes: payload.routes, providers: payload.providers }); try { const saved = await elephantnoteClient.ai.setConfig(clonePlainObject(payload)); currentConfig.value = normalizeAiConfig(saved || payload); writeCachedConfig(currentConfig.value); dispatchAiConfigChanged(currentConfig.value); if (!silent) message.value = 'AI config saved.'; autosaveMessage.value = 'Saved'; log.info('[ai-settings] saveConfig:done', { localAi: currentConfig.value.localAi, routes: currentConfig.value.routes }) } catch (error) { log.error('[ai-settings] saveConfig:failed', error); dispatchAiConfigChanged(payload); if (!silent) message.value = error instanceof Error ? error.message : 'Unable to save AI config.'; autosaveMessage.value = 'Saved locally' } finally { persisting.value = false; if (!silent) saving.value = false } }
const testPayloadFor = (routeName) => { const route = form.value.routes?.[routeName] || {}; return runtimeTestPayload({ source: route.source, endpoint: route.endpoint, model: route.model, label: routeName }) }
const testRoute = async (routeName) => { testing.value = true; const payload = testPayloadFor(routeName); message.value = `Testing ${routeName}...`; log.info('[ai-settings] route-test:start', { routeName, payload }); try { const result = await elephantnoteClient.ai.testConfig(clonePlainObject(payload)); message.value = `${routeName} OK · ${Math.round(result.latencyMs || 0)} ms`; if (routeName === 'embedding') embeddingMessage.value = message.value; log.info('[ai-settings] route-test:done', { routeName, result }) } catch (error) { log.error('[ai-settings] route-test:failed', { routeName, error }); message.value = error instanceof Error ? error.message : `${routeName} test failed.`; if (routeName === 'embedding') embeddingMessage.value = message.value } finally { testing.value = false } }
const testProvider = async (provider) => { providerMessage.value = `Testing ${provider.label}...`; const source = provider.type === 'openai-compatible' ? 'api' : provider.type; const payload = runtimeTestPayload({ source, endpoint: provider.endpoint, model: provider.type === 'mistral' ? 'mistral-small-latest' : 'gpt-4.1-mini', apiKey: provider.apiKey, label: provider.label }); log.info('[ai-settings] provider-test:start', { provider: provider.id, payload }); try { const result = await elephantnoteClient.ai.testConfig(clonePlainObject(payload)); providerMessage.value = `${provider.label} OK · ${Math.round(result.latencyMs || 0)} ms`; log.info('[ai-settings] provider-test:done', { provider: provider.id, result }) } catch (error) { log.error('[ai-settings] provider-test:failed', { provider: provider.id, error }); providerMessage.value = error instanceof Error ? error.message : 'Provider test failed.' } }
const testCodex = async () => { testing.value = true; providerMessage.value = 'Testing Codex...'; const payload = runtimeTestPayload({ source: 'codex', endpoint: 'codex://account', model: 'gpt-5.1-codex', label: 'Codex' }); log.info('[ai-settings] codex-test:start', payload); try { const result = await elephantnoteClient.ai.testConfig(clonePlainObject(payload)); providerMessage.value = `Codex OK · ${Math.round(result.latencyMs || 0)} ms`; log.info('[ai-settings] codex-test:done', result) } catch (error) { log.error('[ai-settings] codex-test:failed', error); providerMessage.value = error instanceof Error ? error.message : 'Codex test failed.' } finally { testing.value = false } }
const loadSearchStatus = async () => { embeddingMessage.value = 'Loading index status...'; log.info('[ai-settings] embedding-status:start'); try { const status = await elephantnoteClient.search.status?.(); embeddingMessage.value = `Index status loaded: ${status?.indexedNotes ?? status?.notesIndexed ?? 'unknown'} notes`; log.info('[ai-settings] embedding-status:done', status) } catch (error) { log.error('[ai-settings] embedding-status:failed', error); embeddingMessage.value = error instanceof Error ? error.message : 'Unable to load index status.' } }
const rebuildEmbeddings = async () => { indexing.value = true; embeddingMessage.value = 'Rebuilding embedding base...'; log.info('[ai-settings] embedding-rebuild:start'); try { const result = await elephantnoteClient.search.rebuild?.(); embeddingMessage.value = 'Embedding rebuild started.'; log.info('[ai-settings] embedding-rebuild:done', result) } catch (error) { log.error('[ai-settings] embedding-rebuild:failed', error); embeddingMessage.value = error instanceof Error ? error.message : 'Embedding rebuild failed.' } finally { indexing.value = false } }
watch(form, () => scheduleAutosave('form-watch'), { deep: true })
watch(() => form.value.localAi.enabled, (enabled) => { if (!enabled) localModels.value = [] })
onMounted(loadConfig)
onBeforeUnmount(() => { window.clearTimeout(autosaveTimer); if (hydrated.value) saveConfig({ silent: true, reason: 'settings-close' }) })
</script>

<style scoped>
.en-ai-settings {
  display: grid;
  gap: 14px;
  color: var(--en-text, #101828);
}

.en-ai-top-actions,
.en-ai-tabs,
.en-ai-actions,
.en-ai-route-summary,
.en-ai-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.en-ai-top-actions {
  justify-content: flex-end;
}

.en-ai-top-actions span,
.en-ai-route-summary span,
.en-ai-actions span,
.en-provider-summary span,
.en-provider-summary small {
  color: var(--en-muted, #475467);
}

.en-ai-top-actions span {
  font-size: 12px;
}

.en-ai-section-title {
  justify-content: space-between;
}

.en-ai-block {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--en-border, #c5cfdd);
  border-radius: 16px;
  background: var(--en-soft, #e9eff7);
  color: var(--en-text, #101828);
}

.en-ai-inline-block {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.en-ai-block h4 {
  margin: 0;
  color: var(--en-text, #101828);
}

.en-ai-tabs button,
.en-ai-actions button,
.en-ai-top-actions button,
.en-ai-section-title button,
.en-provider-remove,
.en-provider-summary,
.en-ai-block > button {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--en-border, #c5cfdd);
  border-radius: 12px;
  background: var(--en-surface, #ffffff);
  color: var(--en-text, #101828);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.en-ai-tabs button:hover:not(:disabled),
.en-ai-actions button:hover:not(:disabled),
.en-ai-top-actions button:hover:not(:disabled),
.en-ai-section-title button:hover:not(:disabled),
.en-provider-remove:hover:not(:disabled),
.en-provider-summary:hover:not(:disabled),
.en-ai-block > button:hover:not(:disabled) {
  border-color: var(--en-border-strong, #aebacd);
  background: var(--en-soft-strong, #dfe7f1);
}

.en-ai-tabs button.active,
.en-ai-actions button.active,
.en-ai-block > button.active {
  border-color: var(--en-primary, #2563eb);
  background: var(--selectionColor, rgba(37, 99, 235, 0.16));
  color: var(--en-primary, #2563eb);
  font-weight: 600;
}

.en-ai-tabs button.active {
  background: var(--en-primary, #2563eb);
  color: #ffffff;
}

.en-ai-tabs button:focus-visible,
.en-ai-actions button:focus-visible,
.en-ai-top-actions button:focus-visible,
.en-ai-section-title button:focus-visible,
.en-provider-remove:focus-visible,
.en-provider-summary:focus-visible,
.en-ai-block > button:focus-visible,
.en-ai-grid input:focus-visible,
.en-ai-grid select:focus-visible,
.en-ai-full input:focus-visible,
.en-ai-full textarea:focus-visible,
.en-provider-details input:focus-visible,
.en-provider-details select:focus-visible {
  outline: 2px solid var(--en-primary, #2563eb);
  outline-offset: 2px;
}

.en-ai-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.en-ai-grid label,
.en-ai-full,
.en-provider-details label {
  display: grid;
  gap: 6px;
  color: var(--en-muted, #475467);
}

.en-ai-grid input,
.en-ai-grid select,
.en-ai-full input,
.en-ai-full textarea,
.en-provider-details input,
.en-provider-details select {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--en-border, #c5cfdd);
  border-radius: 12px;
  background: var(--en-surface, #ffffff);
  color: var(--en-text, #101828);
}

.en-ai-grid input::placeholder,
.en-ai-full input::placeholder,
.en-ai-full textarea::placeholder,
.en-provider-details input::placeholder {
  color: var(--en-subtle, #667085);
}

.en-ai-full textarea {
  padding: 10px 12px;
  resize: vertical;
}

.en-provider-list {
  display: grid;
  gap: 8px;
}

.en-provider-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.en-provider-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  text-align: left;
  gap: 10px;
  align-items: center;
}

.en-provider-summary strong {
  color: var(--en-text, #101828);
}

.en-provider-details {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--en-border, #c5cfdd);
  border-radius: 14px;
  background: var(--en-surface, #ffffff);
}

@media (max-width: 760px) {
  .en-ai-grid,
  .en-provider-details {
    grid-template-columns: 1fr;
  }

  .en-ai-inline-block {
    grid-template-columns: 1fr;
  }

  .en-provider-summary {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <section class="en-ai-settings">
    <header class="en-ai-header">
      <div>
        <h3>AI settings</h3>
        <p>Local models are managed by the Model Library. Providers and feature routes are configured here.</p>
      </div>
      <div class="en-ai-actions">
        <button type="button" :disabled="loading" @click="loadConfig">{{ loading ? 'Loading...' : 'Reload' }}</button>
        <button type="button" :disabled="saving" @click="saveConfig">{{ saving ? 'Saving...' : 'Save' }}</button>
      </div>
    </header>

    <nav class="en-ai-tabs" aria-label="AI settings pages">
      <button v-for="page in aiPages" :key="page.id" type="button" :class="{ active: activePage === page.id }" @click="activePage = page.id">
        {{ page.label }}
      </button>
    </nav>

    <template v-if="activePage === 'provider'">
      <section class="en-ai-block">
        <h4>App Local</h4>
        <p class="en-ai-muted">Internal ElephantNote local AI. It exposes the Model Library icon and downloaded Hugging Face models. Disabling it hides local downloaded models without deleting them.</p>
        <div class="en-ai-actions">
          <button type="button" :class="{ active: form.localAi.enabled }" @click="toggleLocalAi">
            {{ form.localAi.enabled ? 'App Local enabled' : 'App Local disabled' }}
          </button>
          <button type="button" :disabled="!form.localAi.enabled" :class="{ active: form.localAi.showModelLibraryInSidebar }" @click="form.localAi.showModelLibraryInSidebar = !form.localAi.showModelLibraryInSidebar">
            {{ form.localAi.showModelLibraryInSidebar ? 'Show Model Library icon' : 'Hide Model Library icon' }}
          </button>
          <button type="button" :disabled="!form.localAi.enabled" :class="{ active: form.localAi.allowHuggingFaceDownloads }" @click="form.localAi.allowHuggingFaceDownloads = !form.localAi.allowHuggingFaceDownloads">
            {{ form.localAi.allowHuggingFaceDownloads ? 'HF downloads allowed' : 'HF downloads blocked' }}
          </button>
          <button type="button" :disabled="!form.localAi.enabled" :class="{ active: form.localAi.allowLocalRuntimeAutostart }" @click="form.localAi.allowLocalRuntimeAutostart = !form.localAi.allowLocalRuntimeAutostart">
            {{ form.localAi.allowLocalRuntimeAutostart ? 'Autostart local runtime' : 'No local autostart' }}
          </button>
        </div>
        <div class="en-ai-route-summary" v-if="form.localAi.enabled">
          <span>Embedding: {{ localSelection.embedding || 'not assigned' }}</span>
          <span>Chat: {{ localSelection.chat || 'not assigned' }}</span>
          <span>OCR: {{ localSelection.ocr || 'not assigned' }}</span>
        </div>
      </section>

      <section class="en-ai-block">
        <h4>External providers</h4>
        <p class="en-ai-muted">Add API/Codex/Ollama/LM Studio/llama.cpp providers. Codex is a bridge provider like Pi: config is stored here, execution remains backend-side.</p>
        <div class="en-ai-grid">
          <label><span>Default external provider</span><select v-model="form.defaultProvider"><option value="api">OpenAI-compatible API</option><option value="codex">Codex bridge</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="llamacpp">llama.cpp server</option><option value="atomic">Atomic provider registry</option></select></label>
          <label><span>Default temperature</span><input v-model.number="form.temperature" type="number" min="0" max="2" step="0.05" /></label>
          <label><span>Default max tokens</span><input v-model.number="form.maxTokens" type="number" min="1" step="128" /></label>
          <label><span>Default context window</span><input v-model.number="form.contextWindow" type="number" min="512" step="512" /></label>
        </div>
      </section>

      <section class="en-ai-block">
        <h4>API providers</h4>
        <div class="en-ai-grid">
          <label><span>Provider label</span><input v-model.trim="form.providers.api.label" type="text" placeholder="OpenRouter / Mistral / OpenAI" /></label>
          <label><span>Base URL</span><input v-model.trim="form.providers.api.endpoint" type="text" placeholder="https://api.openai.com/v1" /></label>
          <label><span>API key</span><input v-model.trim="form.providers.api.apiKey" type="password" autocomplete="off" placeholder="API key" /></label>
          <label><span>Headers JSON</span><input v-model.trim="form.providers.api.headersJson" type="text" placeholder='{"HTTP-Referer":"..."}' /></label>
        </div>
      </section>

      <section class="en-ai-block">
        <h4>Local external runtimes</h4>
        <div class="en-ai-grid">
          <label><span>Ollama endpoint</span><input v-model.trim="form.providers.ollama.endpoint" type="text" placeholder="http://127.0.0.1:11434" /></label>
          <label><span>LM Studio endpoint</span><input v-model.trim="form.providers.lmstudio.endpoint" type="text" placeholder="http://127.0.0.1:1234/v1" /></label>
          <label><span>llama.cpp server endpoint</span><input v-model.trim="form.providers.llamacpp.endpoint" type="text" placeholder="http://127.0.0.1:8080" /></label>
          <label><span>Atomic provider id</span><input v-model.trim="form.providers.atomic.providerId" type="text" placeholder="provider id" /></label>
        </div>
      </section>

      <section class="en-ai-block">
        <h4>Codex connection</h4>
        <div class="en-ai-grid">
          <label><span>Codex bridge id</span><input v-model.trim="form.providers.codex.id" type="text" placeholder="codex" /></label>
          <label><span>Command</span><input v-model.trim="form.providers.codex.command" type="text" placeholder="codex" /></label>
          <label><span>Args</span><input v-model.trim="form.providers.codex.args" type="text" placeholder="--model gpt-5.1-codex" /></label>
          <label><span>Working directory</span><input v-model.trim="form.providers.codex.cwd" type="text" placeholder="empty = active vault" /></label>
        </div>
        <div class="en-ai-actions">
          <button type="button" :disabled="loadingAtomic" @click="loadAtomicProviders">{{ loadingAtomic ? 'Inspecting...' : 'Inspect Atomic providers' }}</button>
          <span>{{ atomicMessage }}</span>
        </div>
        <pre v-if="atomicText">{{ atomicText }}</pre>
      </section>
    </template>

    <template v-else-if="activePage === 'chat'">
      <section class="en-ai-block">
        <h4>Chat model</h4>
        <div class="en-ai-grid">
          <label><span>Runtime</span><select v-model="form.routes.chat.source"><option v-for="source in routeSources" :key="source.id" :value="source.id">{{ source.label }}</option></select></label>
          <label><span>Model</span><input v-model.trim="form.routes.chat.model" list="chat-model-candidates" type="text" placeholder="Start typing a local/API/Codex model" /></label>
          <label><span>Fallback runtime</span><select v-model="form.routes.chat.fallbackSource"><option value="">No fallback</option><option v-for="source in routeSources" :key="source.id" :value="source.id">{{ source.label }}</option></select></label>
          <label><span>Fallback model</span><input v-model.trim="form.routes.chat.fallbackModel" list="chat-model-candidates" type="text" placeholder="optional" /></label>
        </div>
        <datalist id="chat-model-candidates"><option v-for="candidate in chatCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.label }}</option></datalist>
      </section>
      <section class="en-ai-block">
        <h4>Chat behavior</h4>
        <label class="en-ai-full"><span>Prompt d'initialisation</span><textarea v-model="form.routes.chat.systemPrompt" rows="6" placeholder="System prompt for chat, RAG and agent answers." /></label>
        <div class="en-ai-grid">
          <label><span>Temperature</span><input v-model.number="form.routes.chat.temperature" type="number" min="0" max="2" step="0.05" /></label>
          <label><span>Max tokens</span><input v-model.number="form.routes.chat.maxTokens" type="number" min="1" step="128" /></label>
          <label><span>Context window</span><input v-model.number="form.routes.chat.contextWindow" type="number" min="512" step="512" /></label>
          <label><span>RAG notes limit</span><input v-model.number="form.routes.chat.ragTopK" type="number" min="1" max="50" /></label>
        </div>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.chat.enableRag }" @click="form.routes.chat.enableRag = !form.routes.chat.enableRag">{{ form.routes.chat.enableRag ? 'RAG on' : 'RAG off' }}</button><button type="button" :class="{ active: form.routes.chat.enableTools }" @click="form.routes.chat.enableTools = !form.routes.chat.enableTools">{{ form.routes.chat.enableTools ? 'Tools on' : 'Tools off' }}</button><button type="button" :class="{ active: form.routes.chat.stream }" @click="form.routes.chat.stream = !form.routes.chat.stream">{{ form.routes.chat.stream ? 'Streaming on' : 'Streaming off' }}</button></div>
      </section>
    </template>

    <template v-else-if="activePage === 'embedding'">
      <section class="en-ai-block">
        <h4>Embedding model</h4>
        <div class="en-ai-grid">
          <label><span>Runtime</span><select v-model="form.routes.embedding.source"><option v-for="source in routeSources" :key="source.id" :value="source.id">{{ source.label }}</option></select></label>
          <label><span>Model</span><input v-model.trim="form.routes.embedding.model" list="embedding-model-candidates" type="text" placeholder="Start typing an embedding model" /></label>
          <label><span>Distance</span><select v-model="form.routes.embedding.distance"><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="euclidean">Euclidean</option></select></label>
          <label><span>Dimensions</span><input v-model.number="form.routes.embedding.dimensions" type="number" min="0" placeholder="auto" /></label>
        </div>
        <datalist id="embedding-model-candidates"><option v-for="candidate in embeddingCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.label }}</option></datalist>
      </section>
      <section class="en-ai-block">
        <h4>Indexing and search</h4>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.embedding.autoIndex }" @click="form.routes.embedding.autoIndex = !form.routes.embedding.autoIndex">{{ form.routes.embedding.autoIndex ? 'Auto-index new notes' : 'Manual indexing only' }}</button><button type="button" :class="{ active: form.routes.embedding.backgroundIndex }" @click="form.routes.embedding.backgroundIndex = !form.routes.embedding.backgroundIndex">{{ form.routes.embedding.backgroundIndex ? 'Background indexing' : 'No background indexing' }}</button></div>
        <div class="en-ai-grid">
          <label><span>Debounce after edit (ms)</span><input v-model.number="form.routes.embedding.debounceMs" type="number" min="0" step="250" /></label>
          <label><span>Chunk strategy</span><select v-model="form.routes.embedding.chunkStrategy"><option value="markdown-heading">Markdown headings</option><option value="paragraph">Paragraphs</option><option value="fixed">Fixed size</option><option value="hybrid">Hybrid</option></select></label>
          <label><span>Chunk size</span><input v-model.number="form.routes.embedding.chunkSize" type="number" min="64" step="64" /></label>
          <label><span>Chunk overlap</span><input v-model.number="form.routes.embedding.chunkOverlap" type="number" min="0" step="16" /></label>
          <label><span>Search top K</span><input v-model.number="form.routes.embedding.searchTopK" type="number" min="1" max="100" /></label>
          <label><span>Semantic threshold</span><input v-model.number="form.routes.embedding.threshold" type="number" min="0" max="1" step="0.01" /></label>
          <label><span>Semantic weight</span><input v-model.number="form.routes.embedding.semanticWeight" type="number" min="0" max="1" step="0.05" /></label>
          <label><span>Lexical weight</span><input v-model.number="form.routes.embedding.lexicalWeight" type="number" min="0" max="1" step="0.05" /></label>
        </div>
        <div class="en-ai-actions"><button type="button" :disabled="indexing" @click="rebuildEmbeddings">{{ indexing ? 'Rebuilding...' : 'Rebuild embedding base' }}</button><button type="button" @click="loadSearchStatus">Refresh index status</button><span>{{ embeddingMessage }}</span></div>
        <pre v-if="searchStatusText">{{ searchStatusText }}</pre>
      </section>
    </template>

    <template v-else-if="activePage === 'ocr'">
      <section class="en-ai-block">
        <h4>OCR model</h4>
        <div class="en-ai-grid">
          <label><span>Runtime</span><select v-model="form.routes.ocr.source"><option v-for="source in routeSources" :key="source.id" :value="source.id">{{ source.label }}</option></select></label>
          <label><span>Model</span><input v-model.trim="form.routes.ocr.model" list="ocr-model-candidates" type="text" placeholder="local OCR, Mistral OCR, vision model..." /></label>
          <label><span>Languages</span><input v-model.trim="form.routes.ocr.languages" type="text" placeholder="eng,fra,heb" /></label>
          <label><span>PDF mode</span><select v-model="form.routes.ocr.pdfMode"><option value="missing-text-only">Only pages without text</option><option value="all-pages">All pages</option><option value="skip-text-pdf">Skip text PDFs</option></select></label>
        </div>
        <datalist id="ocr-model-candidates"><option v-for="candidate in ocrCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.label }}</option></datalist>
      </section>
      <section class="en-ai-block">
        <h4>OCR behavior</h4>
        <div class="en-ai-actions"><button type="button" :class="{ active: form.routes.ocr.autoOcr }" @click="form.routes.ocr.autoOcr = !form.routes.ocr.autoOcr">{{ form.routes.ocr.autoOcr ? 'Auto OCR new images' : 'Manual OCR only' }}</button><button type="button" :class="{ active: form.routes.ocr.deskew }" @click="form.routes.ocr.deskew = !form.routes.ocr.deskew">Deskew</button><button type="button" :class="{ active: form.routes.ocr.denoise }" @click="form.routes.ocr.denoise = !form.routes.ocr.denoise">Denoise</button><button type="button" :class="{ active: form.routes.ocr.upscale }" @click="form.routes.ocr.upscale = !form.routes.ocr.upscale">Upscale</button></div>
        <div class="en-ai-grid"><label><span>Output format</span><select v-model="form.routes.ocr.output"><option value="markdown">Markdown</option><option value="plain-text">Plain text</option><option value="layout-markdown">Layout Markdown</option></select></label><label><span>Confidence threshold</span><input v-model.number="form.routes.ocr.confidenceThreshold" type="number" min="0" max="1" step="0.01" /></label><label><span>Fallback runtime</span><select v-model="form.routes.ocr.fallbackSource"><option value="">No fallback</option><option v-for="source in routeSources" :key="source.id" :value="source.id">{{ source.label }}</option></select></label><label><span>Fallback model</span><input v-model.trim="form.routes.ocr.fallbackModel" list="ocr-model-candidates" type="text" /></label></div>
      </section>
    </template>

    <section class="en-ai-block">
      <h4>Debug</h4>
      <div class="en-ai-actions"><button type="button" :disabled="testing" @click="testConfig">{{ testing ? 'Testing...' : 'Test current config' }}</button><span>{{ message }}</span></div>
      <pre>{{ preview }}</pre>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import log from 'electron-log/renderer'
import { normalizeAiConfig, normalizeLocalAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'
import { getModelCapabilities, resolveModelId, resolveModelName } from '../views/modelsViewHelpers'

const aiPages = Object.freeze([{ id: 'provider', label: 'Provider' }, { id: 'chat', label: 'Chat' }, { id: 'embedding', label: 'Embedding' }, { id: 'ocr', label: 'OCR' }])
const activePage = ref('provider')
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const indexing = ref(false)
const loadingAtomic = ref(false)
const message = ref('')
const embeddingMessage = ref('')
const atomicMessage = ref('')
const atomicText = ref('')
const searchStatusText = ref('')
const currentConfig = ref(normalizeAiConfig())
const localSelection = ref({ embedding: '', chat: '', ocr: '' })
const localModels = ref([])

const defaultRoute = () => ({ source: 'app-local', model: '', endpoint: '', optionsJson: '' })
const defaultChatRoute = () => ({ ...defaultRoute(), systemPrompt: '', temperature: 0.2, maxTokens: 2048, contextWindow: 8192, ragTopK: 6, enableRag: true, enableTools: true, stream: true, fallbackSource: '', fallbackModel: '' })
const defaultEmbeddingRoute = () => ({ ...defaultRoute(), autoIndex: true, backgroundIndex: true, debounceMs: 1500, distance: 'cosine', dimensions: 0, chunkStrategy: 'markdown-heading', chunkSize: 700, chunkOverlap: 80, searchTopK: 20, threshold: 0.35, semanticWeight: 0.75, lexicalWeight: 0.25 })
const defaultOcrRoute = () => ({ ...defaultRoute(), languages: 'eng,fra', pdfMode: 'missing-text-only', autoOcr: false, deskew: true, denoise: true, upscale: false, output: 'markdown', confidenceThreshold: 0.55, fallbackSource: '', fallbackModel: '' })
const defaultProviders = () => ({ api: { label: 'OpenAI-compatible API', endpoint: '', apiKey: '', headersJson: '' }, ollama: { endpoint: 'http://127.0.0.1:11434' }, lmstudio: { endpoint: 'http://127.0.0.1:1234/v1' }, llamacpp: { endpoint: 'http://127.0.0.1:8080' }, codex: { id: 'codex', command: 'codex', args: '', cwd: '' }, pi: { endpoint: '' }, atomic: { providerId: '' } })
const defaultForm = () => ({ localAi: normalizeLocalAiConfig(), defaultProvider: 'api', temperature: 0.2, maxTokens: 2048, contextWindow: 8192, providers: defaultProviders(), routes: { chat: defaultChatRoute(), embedding: defaultEmbeddingRoute(), ocr: defaultOcrRoute() } })
const form = ref(defaultForm())

const externalSources = Object.freeze([{ id: 'api', label: 'API provider' }, { id: 'codex', label: 'Codex bridge' }, { id: 'ollama', label: 'Ollama' }, { id: 'lmstudio', label: 'LM Studio' }, { id: 'llamacpp', label: 'llama.cpp server' }, { id: 'atomic', label: 'Atomic provider' }, { id: 'disabled', label: 'Disabled' }])
const routeSources = computed(() => form.value.localAi.enabled ? [{ id: 'app-local', label: 'App local role' }, ...externalSources] : externalSources)
const commonExternalCandidates = Object.freeze([
  { id: 'gpt-4.1-mini', label: 'OpenAI-compatible · gpt-4.1-mini', caps: ['chat'] },
  { id: 'anthropic/claude-3.5-sonnet', label: 'OpenRouter · Claude 3.5 Sonnet', caps: ['chat'] },
  { id: 'mistral-small-latest', label: 'Mistral · mistral-small-latest', caps: ['chat'] },
  { id: 'codex', label: 'Codex bridge · subscription model', caps: ['chat'] },
  { id: 'text-embedding-3-small', label: 'OpenAI-compatible · text-embedding-3-small', caps: ['embedding'] },
  { id: 'nomic-embed-text', label: 'Ollama · nomic-embed-text', caps: ['embedding'] },
  { id: 'mistral-embed', label: 'Mistral · mistral-embed', caps: ['embedding'] },
  { id: 'mistral-ocr-latest', label: 'Mistral · mistral-ocr-latest', caps: ['ocr'] },
  { id: 'tesseract-local', label: 'Local OCR · Tesseract', caps: ['ocr'] }
])
const localCandidates = computed(() => form.value.localAi.enabled ? localModels.value.map((model) => ({ id: resolveModelId(model), label: `App local · ${resolveModelName(model)}`, caps: getModelCapabilities(model).map((cap) => String(cap).toLowerCase()) })) : [])
const allCandidates = computed(() => [...localCandidates.value, ...commonExternalCandidates])
const candidatesFor = (capability) => allCandidates.value.filter((candidate) => candidate.caps.includes(capability) || (capability === 'chat' && candidate.caps.length === 0))
const chatCandidates = computed(() => candidatesFor('chat'))
const embeddingCandidates = computed(() => candidatesFor('embedding'))
const ocrCandidates = computed(() => candidatesFor('ocr'))

const parseJsonObject = (text = '') => { if (!String(text).trim()) return {}; try { const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch (error) { log.warn('[ai-settings] invalid-json', error); return {} } }
const stringifyOptions = (value) => value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value) : ''
const normalizeProviderForm = (providers = {}) => {
  const defaults = defaultProviders()
  return {
    api: { ...defaults.api, ...(providers.api || {}), headersJson: stringifyOptions(providers.api?.headers) || providers.api?.headersJson || '' },
    ollama: { ...defaults.ollama, ...(providers.ollama || {}) },
    lmstudio: { ...defaults.lmstudio, ...(providers.lmstudio || {}) },
    llamacpp: { ...defaults.llamacpp, ...(providers.llamacpp || {}) },
    codex: { ...defaults.codex, ...(providers.codex || {}), args: Array.isArray(providers.codex?.args) ? providers.codex.args.join(' ') : providers.codex?.args || '' },
    pi: { ...defaults.pi, ...(providers.pi || {}) },
    atomic: { ...defaults.atomic, ...(providers.atomic || {}) }
  }
}
const normalizeBaseRoute = (route = {}, fallback = defaultRoute()) => ({ ...fallback, ...route, optionsJson: stringifyOptions(route.options) || route.optionsJson || '' })
const routePayload = (route = {}) => ({ ...route, provider: route.source, options: parseJsonObject(route.optionsJson), optionsJson: undefined })
const primaryEndpoint = (source) => source === 'api' ? form.value.providers.api.endpoint : source === 'ollama' ? form.value.providers.ollama.endpoint : source === 'lmstudio' ? form.value.providers.lmstudio.endpoint : source === 'llamacpp' ? form.value.providers.llamacpp.endpoint : source === 'codex' ? 'codex://bridge' : source === 'atomic' ? 'atomic://provider' : 'node-llama-cpp://local'
const applyConfig = (config = {}) => {
  log.info('[ai-settings] applyConfig:start', { keys: Object.keys(config || {}) })
  const routes = config.routes || {}
  form.value = { ...defaultForm(), localAi: normalizeLocalAiConfig(config.localAi), defaultProvider: config.defaultProvider || 'api', temperature: Number(config.temperature ?? 0.2), maxTokens: Number(config.maxTokens ?? 2048), contextWindow: Number(config.contextWindow ?? 8192), providers: normalizeProviderForm(config.providers || {}), routes: { chat: normalizeBaseRoute(routes.chat, defaultChatRoute()), embedding: normalizeBaseRoute(routes.embedding, defaultEmbeddingRoute()), ocr: normalizeBaseRoute(routes.ocr, defaultOcrRoute()) } }
  log.info('[ai-settings] applyConfig:done', { localAi: form.value.localAi, routes: form.value.routes })
}
const buildConfig = () => {
  const chatRoute = form.value.routes.chat
  const provider = chatRoute.source === 'app-local' ? 'node-llama-cpp' : chatRoute.source
  return normalizeAiConfig({ ...clonePlainObject(currentConfig.value), localAi: clonePlainObject(form.value.localAi), defaultProvider: form.value.defaultProvider, provider, transport: provider, endpoint: chatRoute.endpoint || primaryEndpoint(chatRoute.source), model: chatRoute.model, temperature: Number(form.value.temperature) || 0.2, maxTokens: Number(form.value.maxTokens) || 2048, contextWindow: Number(form.value.contextWindow) || 8192, providers: { ...clonePlainObject(form.value.providers), api: { ...clonePlainObject(form.value.providers.api), headers: parseJsonObject(form.value.providers.api.headersJson), headersJson: undefined }, codex: { ...clonePlainObject(form.value.providers.codex), mode: 'bridge', args: form.value.providers.codex.args.split(' ').filter(Boolean) }, pi: { ...clonePlainObject(form.value.providers.pi), mode: 'bridge' } }, routes: { chat: routePayload(form.value.routes.chat), embedding: routePayload(form.value.routes.embedding), ocr: routePayload(form.value.routes.ocr) }, localModelSelection: clonePlainObject(localSelection.value) })
}
const redactedConfig = () => { const config = clonePlainObject(buildConfig()); if (config.providers?.api?.apiKey) config.providers.api.apiKey = '[redacted]'; return config }
const preview = computed(() => JSON.stringify(redactedConfig(), null, 2))

const loadLocalSelection = async () => { try { localSelection.value = { embedding: '', chat: '', ocr: '', ...(await elephantnoteClient.models.getSelection?.()) }; log.info('[ai-settings] local-selection:loaded', localSelection.value) } catch (error) { log.warn('[ai-settings] local-selection:failed', error) } }
const loadLocalModels = async () => { if (!form.value.localAi.enabled) { localModels.value = []; return } try { const result = await elephantnoteClient.models.list?.(); localModels.value = Array.isArray(result?.models) ? result.models : []; log.info('[ai-settings] local-models:loaded', { count: localModels.value.length }) } catch (error) { log.warn('[ai-settings] local-models:failed', error) } }
const dispatchAiConfigChanged = (config) => window.dispatchEvent(new CustomEvent('elephantnote:ai-config-changed', { detail: config }))
const toggleLocalAi = () => { form.value.localAi.enabled = !form.value.localAi.enabled; if (!form.value.localAi.enabled) { form.value.localAi.showModelLibraryInSidebar = false; for (const route of Object.values(form.value.routes)) if (route.source === 'app-local') route.source = 'disabled' } else { form.value.localAi.showModelLibraryInSidebar = true } log.info('[ai-settings] local-ai:toggled', form.value.localAi); loadLocalModels() }
const loadConfig = async () => { loading.value = true; message.value = 'Loading AI config...'; log.info('[ai-settings] loadConfig:start'); try { await loadLocalSelection(); const config = await elephantnoteClient.ai.getConfig(); currentConfig.value = normalizeAiConfig(config); applyConfig(currentConfig.value); await loadLocalModels(); dispatchAiConfigChanged(currentConfig.value); message.value = 'AI config loaded.'; log.info('[ai-settings] loadConfig:done', { localAi: form.value.localAi, routes: form.value.routes }) } catch (error) { log.error('[ai-settings] loadConfig:failed', error); message.value = error instanceof Error ? error.message : 'Unable to load AI config.' } finally { loading.value = false } }
const saveConfig = async () => { saving.value = true; message.value = 'Saving AI config...'; const payload = buildConfig(); log.info('[ai-settings] saveConfig:start', { localAi: payload.localAi, provider: payload.provider, routes: payload.routes }); try { const saved = await elephantnoteClient.ai.setConfig(clonePlainObject(payload)); currentConfig.value = normalizeAiConfig(saved || payload); dispatchAiConfigChanged(currentConfig.value); message.value = 'AI config saved.'; log.info('[ai-settings] saveConfig:done', { localAi: currentConfig.value.localAi, routes: currentConfig.value.routes }) } catch (error) { log.error('[ai-settings] saveConfig:failed', error); message.value = error instanceof Error ? error.message : 'Unable to save AI config.' } finally { saving.value = false } }
const testConfig = async () => { testing.value = true; const payload = buildConfig(); message.value = 'Testing AI config...'; log.info('[ai-settings] testConfig:start', { provider: payload.provider, endpoint: payload.endpoint, model: payload.model, routes: payload.routes }); try { const result = await elephantnoteClient.ai.testConfig(clonePlainObject(payload)); message.value = `AI config OK · ${Math.round(result.latencyMs || 0)} ms · ${result.response || 'response received'}`; log.info('[ai-settings] testConfig:done', result) } catch (error) { log.error('[ai-settings] testConfig:failed', error); message.value = error instanceof Error ? error.message : 'AI endpoint test failed.' } finally { testing.value = false } }
const loadAtomicProviders = async () => { loadingAtomic.value = true; atomicMessage.value = 'Inspecting Atomic providers...'; log.info('[ai-settings] loadAtomicProviders:start'); try { const providers = await elephantnoteClient.atomicFeatures.providers(); atomicText.value = JSON.stringify(providers, null, 2); atomicMessage.value = 'Atomic providers loaded.'; log.info('[ai-settings] loadAtomicProviders:done', providers) } catch (error) { log.error('[ai-settings] loadAtomicProviders:failed', error); atomicMessage.value = error instanceof Error ? error.message : 'Unable to inspect Atomic providers.' } finally { loadingAtomic.value = false } }
const loadSearchStatus = async () => { embeddingMessage.value = 'Loading index status...'; log.info('[ai-settings] embedding-status:start'); try { const status = await elephantnoteClient.search.status?.(); searchStatusText.value = JSON.stringify(status || {}, null, 2); embeddingMessage.value = 'Index status loaded.'; log.info('[ai-settings] embedding-status:done', status) } catch (error) { log.error('[ai-settings] embedding-status:failed', error); embeddingMessage.value = error instanceof Error ? error.message : 'Unable to load index status.' } }
const rebuildEmbeddings = async () => { indexing.value = true; embeddingMessage.value = 'Rebuilding embedding base...'; log.info('[ai-settings] embedding-rebuild:start'); try { const result = await elephantnoteClient.search.rebuild?.(); searchStatusText.value = JSON.stringify(result || {}, null, 2); embeddingMessage.value = 'Embedding rebuild started.'; log.info('[ai-settings] embedding-rebuild:done', result) } catch (error) { log.error('[ai-settings] embedding-rebuild:failed', error); embeddingMessage.value = error instanceof Error ? error.message : 'Embedding rebuild failed.' } finally { indexing.value = false } }
watch(() => form.value.localAi.enabled, (enabled) => { if (!enabled) localModels.value = [] })
onMounted(loadConfig)
</script>

<style scoped>
.en-ai-settings{display:grid;gap:14px}.en-ai-header,.en-ai-block{display:grid;gap:12px;padding:16px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:16px;background:var(--en-card,#252525)}.en-ai-header{grid-template-columns:minmax(0,1fr) auto;align-items:center}.en-ai-header h3,.en-ai-block h4,.en-ai-route-card h5{margin:0}.en-ai-header p,.en-ai-muted{margin:4px 0 0;color:var(--en-muted,#9a9a9a)}.en-ai-tabs,.en-ai-actions,.en-ai-route-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.en-ai-tabs button,.en-ai-actions button{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4);min-height:34px;padding:0 14px}.en-ai-tabs button.active,.en-ai-actions button.active{border-color:#4caf5c;color:#c9f6d0;background:rgba(76,175,92,.12)}.en-ai-grid,.en-ai-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.en-ai-feature-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.en-ai-route-card{display:grid;gap:10px;padding:12px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:14px;background:rgba(0,0,0,.12)}.en-ai-grid label,.en-ai-route-card label,.en-ai-full{display:grid;gap:6px;color:var(--en-muted,#9a9a9a)}.en-ai-grid input,.en-ai-grid select,.en-ai-route-card input,.en-ai-route-card select,.en-ai-full textarea{width:100%;min-height:38px;padding:0 12px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4)}.en-ai-full textarea{padding:10px 12px;resize:vertical}.en-ai-route-summary span{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:999px;padding:4px 10px;color:var(--en-muted,#9a9a9a)}.en-ai-actions span{color:var(--en-muted,#9a9a9a)}pre{max-height:260px;overflow:auto;padding:12px;border-radius:12px;background:rgba(0,0,0,.25);white-space:pre-wrap;font-size:12px}@media(max-width:760px){.en-ai-header{grid-template-columns:1fr}.en-ai-grid{grid-template-columns:1fr}}
</style>

<template>
  <section class="en-ai-settings">
    <header class="en-ai-hero">
      <div class="en-ai-hero-copy">
        <span class="en-ai-hero-icon"><Sparkles aria-hidden="true" /></span>
        <div>
          <div class="en-ai-title-row">
            <h3>Elephant AI</h3>
            <span class="en-ai-save-status" :class="{ saving: autosaveMessage === 'Saving...' }">
              <span />{{ autosaveMessage || 'Autosave enabled' }}
            </span>
          </div>
          <p>Choose where each capability runs. Local models and external providers remain optional and independently configurable.</p>
        </div>
      </div>
      <div class="en-ai-top-actions">
        <button class="secondary" type="button" :disabled="loading" @click="loadConfig"><RotateCw aria-hidden="true" />{{ loading ? 'Loading…' : 'Reload' }}</button>
        <button class="primary" type="button" :disabled="saving" @click="saveConfig"><Save aria-hidden="true" />{{ saving ? 'Saving…' : 'Save now' }}</button>
      </div>
    </header>

    <nav class="en-ai-tabs" aria-label="AI settings pages">
      <button v-for="page in aiPages" :key="page.id" type="button" :class="{ active: activePage === page.id }" @click="activePage = page.id">
        <component :is="page.icon" aria-hidden="true" />
        <span>{{ page.label }}</span>
      </button>
    </nav>

    <template v-if="activePage === 'provider'">
      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div><h4>Local runtime</h4><p>Run compatible downloaded models directly through the Rust/Tauri runtime.</p></div>
          <span class="en-ai-badge" :class="{ active: form.localAi.enabled }"><Cpu aria-hidden="true" />{{ form.localAi.enabled ? `${localModels.length} model${localModels.length === 1 ? '' : 's'}` : 'Off' }}</span>
        </header>
        <div class="en-ai-setting-row">
          <div class="en-ai-setting-copy"><strong>App Local</strong><span>Enable local chat, embedding and OCR candidates without sending content to a remote API.</span></div>
          <button class="en-ai-switch" type="button" role="switch" :aria-checked="form.localAi.enabled" :class="{ active: form.localAi.enabled }" @click="toggleLocalAi"><span /></button>
        </div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header">
          <div><h4>External providers</h4><p>Add OpenAI-compatible APIs and local servers used by one or more AI capabilities.</p></div>
          <button class="secondary compact" type="button" title="Add provider" @click="addProvider"><Plus aria-hidden="true" /> Add provider</button>
        </header>

        <div v-if="form.providerRows.length" class="en-provider-list">
          <article v-for="provider in form.providerRows" :key="provider.id" class="en-provider-row" :class="{ expanded: provider.expanded }">
            <button type="button" class="en-provider-summary" @click="provider.expanded = !provider.expanded">
              <span class="en-provider-icon"><Server aria-hidden="true" /></span>
              <span class="en-provider-copy">
                <strong>{{ provider.label || provider.type }}</strong>
                <small>{{ provider.type }} · {{ provider.endpoint || 'Endpoint not configured' }}</small>
              </span>
              <span class="en-provider-state" :class="{ active: provider.enabled }">{{ provider.enabled ? 'Enabled' : 'Disabled' }}</span>
              <ChevronDown aria-hidden="true" :class="{ rotated: provider.expanded }" />
            </button>

            <div v-if="provider.expanded" class="en-provider-details">
              <div class="en-provider-form">
                <label><span>Provider type</span><select v-model="provider.type" @change="applyProviderDefaults(provider)"><option value="openai-compatible">OpenAI-compatible</option><option value="openrouter">OpenRouter</option><option value="mistral">Mistral</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="llamacpp">llama.cpp server</option><option value="atomic">Atomic</option></select></label>
                <label><span>Display name</span><input v-model.trim="provider.label" type="text" placeholder="Provider name"></label>
                <label class="wide"><span>Base URL</span><input v-model.trim="provider.endpoint" type="url" placeholder="https://api.openai.com/v1"></label>
                <label><span>API key</span><input v-model.trim="provider.apiKey" type="password" autocomplete="off" placeholder="Optional API key"></label>
                <label><span>Headers JSON</span><input v-model.trim="provider.headersJson" type="text" placeholder='{"Header":"value"}'></label>
              </div>
              <div class="en-provider-footer">
                <div class="en-provider-footer-left">
                  <button class="en-ai-switch small" type="button" role="switch" :aria-checked="provider.enabled" :class="{ active: provider.enabled }" @click="toggleProvider(provider)"><span /></button>
                  <span>{{ provider.enabled ? 'Provider available to routes' : 'Provider excluded from model choices' }}</span>
                </div>
                <div class="en-ai-actions">
                  <button class="secondary compact" type="button" @click="testProvider(provider)"><Activity aria-hidden="true" /> Test</button>
                  <button class="danger compact" type="button" @click="removeProvider(provider.id)"><Trash2 aria-hidden="true" /> Remove</button>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="en-ai-empty"><Server aria-hidden="true" /><div><strong>No external provider</strong><p>Local AI can still work independently. Add a provider when you need a remote model or local server.</p></div><button class="primary compact" type="button" @click="addProvider"><Plus aria-hidden="true" /> Add provider</button></div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Codex account</h4><p>Use an authenticated Codex connection as a chat route.</p></div><span class="en-ai-badge" :class="{ active: form.codex.connected }"><TerminalSquare aria-hidden="true" />{{ form.codex.connected ? 'Connected' : 'Disconnected' }}</span></header>
        <div class="en-ai-setting-row">
          <div class="en-ai-setting-copy"><strong>Codex connection</strong><span>Connect or disconnect the account-backed Codex provider.</span><small v-if="providerMessage">{{ providerMessage }}</small></div>
          <div class="en-ai-actions"><button class="secondary" type="button" :class="{ active: form.codex.connected }" @click="connectCodex"><Link2 aria-hidden="true" />{{ form.codex.connected ? 'Disconnect' : 'Connect' }}</button><button class="secondary" type="button" :disabled="!form.codex.connected || testing" @click="testCodex"><Activity aria-hidden="true" /> Test</button></div>
        </div>
      </section>
    </template>

    <template v-else-if="activePage === 'chat'">
      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Chat model</h4><p>Select the route used by chat, RAG and agent answers.</p></div><span class="en-ai-badge active"><MessageSquare aria-hidden="true" />{{ routeProviderLabel(form.routes.chat.source) }}</span></header>
        <div class="en-ai-model-row">
          <label class="en-ai-full"><span>Model</span><input v-model.trim="form.routes.chat.modelRef" list="chat-model-candidates" type="text" placeholder="Choose or type a model" @change="applyModelChoice('chat')"></label>
          <datalist id="chat-model-candidates"><option v-for="candidate in chatCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
          <div class="en-ai-route-summary"><span>Provider <strong>{{ routeProviderLabel(form.routes.chat.source) }}</strong></span><span>Model <strong>{{ form.routes.chat.model || 'Not selected' }}</strong></span></div>
        </div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Capabilities</h4><p>Enable only the behavior you expect from the selected chat route.</p></div></header>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Retrieval-augmented answers</strong><span>Search relevant notes and include them in the model context.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.chat.enableRag" :class="{ active: form.routes.chat.enableRag }" @click="form.routes.chat.enableRag = !form.routes.chat.enableRag"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Tools</strong><span>Allow the chat route to use supported ElephantNote actions.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.chat.enableTools" :class="{ active: form.routes.chat.enableTools }" @click="form.routes.chat.enableTools = !form.routes.chat.enableTools"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Streaming</strong><span>Display generated text progressively instead of waiting for the complete answer.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.chat.stream" :class="{ active: form.routes.chat.stream }" @click="form.routes.chat.stream = !form.routes.chat.stream"><span /></button></div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Instructions</h4><p>Define the default behavior shared by chat, RAG and agent responses.</p></div></header>
        <div class="en-ai-form-body"><label class="en-ai-full"><span>System prompt</span><textarea v-model="form.routes.chat.systemPrompt" rows="6" placeholder="Instructions for chat, RAG and agent answers."></textarea></label></div>
        <details class="en-ai-advanced">
          <summary><SlidersHorizontal aria-hidden="true" /><span><strong>Advanced generation settings</strong><small>Temperature, context, output length and RAG limit</small></span><ChevronDown aria-hidden="true" /></summary>
          <div class="en-ai-grid"><label><span>Temperature</span><input v-model.number="form.routes.chat.temperature" type="number" min="0" max="2" step="0.05"></label><label><span>Max tokens</span><input v-model.number="form.routes.chat.maxTokens" type="number" min="1" step="128"></label><label><span>Context window</span><input v-model.number="form.routes.chat.contextWindow" type="number" min="512" step="512"></label><label><span>RAG notes limit</span><input v-model.number="form.routes.chat.ragTopK" type="number" min="1" max="50"></label></div>
        </details>
        <div class="en-ai-card-footer"><span>{{ message }}</span><button class="primary" type="button" :disabled="testing" @click="testRoute('chat')"><Activity aria-hidden="true" />{{ testing ? 'Testing…' : 'Test chat route' }}</button></div>
      </section>
    </template>

    <template v-else-if="activePage === 'embedding'">
      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Embedding model</h4><p>Select the model used to index notes and perform semantic retrieval.</p></div><span class="en-ai-badge active"><Database aria-hidden="true" />{{ routeProviderLabel(form.routes.embedding.source) }}</span></header>
        <div class="en-ai-model-row">
          <label class="en-ai-full"><span>Model</span><input v-model.trim="form.routes.embedding.modelRef" list="embedding-model-candidates" type="text" placeholder="Choose or type an embedding model" @change="applyModelChoice('embedding')"></label>
          <datalist id="embedding-model-candidates"><option v-for="candidate in embeddingCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
          <div class="en-ai-route-summary"><span>Provider <strong>{{ routeProviderLabel(form.routes.embedding.source) }}</strong></span><span>Model <strong>{{ form.routes.embedding.model || 'Not selected' }}</strong></span></div>
        </div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Automatic indexing</h4><p>Keep the semantic index synchronized with changes in the vault.</p></div></header>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Index new and edited notes</strong><span>Queue notes automatically after content changes.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.embedding.autoIndex" :class="{ active: form.routes.embedding.autoIndex }" @click="form.routes.embedding.autoIndex = !form.routes.embedding.autoIndex"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Background processing</strong><span>Run pending indexing without blocking the editor.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.embedding.backgroundIndex" :class="{ active: form.routes.embedding.backgroundIndex }" @click="form.routes.embedding.backgroundIndex = !form.routes.embedding.backgroundIndex"><span /></button></div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Search behavior</h4><p>Configure the main retrieval strategy. Technical tuning remains collapsed by default.</p></div></header>
        <div class="en-ai-form-body en-ai-grid"><label><span>Chunk strategy</span><select v-model="form.routes.embedding.chunkStrategy"><option value="markdown-heading">Markdown headings</option><option value="paragraph">Paragraphs</option><option value="fixed">Fixed size</option><option value="hybrid">Hybrid</option></select></label><label><span>Search result limit</span><input v-model.number="form.routes.embedding.searchTopK" type="number" min="1" max="100"></label><label><span>Distance metric</span><select v-model="form.routes.embedding.distance"><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="euclidean">Euclidean</option></select></label><label><span>Semantic threshold</span><input v-model.number="form.routes.embedding.threshold" type="number" min="0" max="1" step="0.01"></label></div>
        <details class="en-ai-advanced">
          <summary><SlidersHorizontal aria-hidden="true" /><span><strong>Advanced indexing settings</strong><small>Dimensions, chunk sizing, overlap and hybrid weights</small></span><ChevronDown aria-hidden="true" /></summary>
          <div class="en-ai-grid"><label><span>Dimensions</span><input v-model.number="form.routes.embedding.dimensions" type="number" min="0" placeholder="auto"></label><label><span>Debounce after edit (ms)</span><input v-model.number="form.routes.embedding.debounceMs" type="number" min="0" step="250"></label><label><span>Chunk size</span><input v-model.number="form.routes.embedding.chunkSize" type="number" min="64" step="64"></label><label><span>Chunk overlap</span><input v-model.number="form.routes.embedding.chunkOverlap" type="number" min="0" step="16"></label><label><span>Semantic weight</span><input v-model.number="form.routes.embedding.semanticWeight" type="number" min="0" max="1" step="0.05"></label><label><span>Lexical weight</span><input v-model.number="form.routes.embedding.lexicalWeight" type="number" min="0" max="1" step="0.05"></label></div>
        </details>
        <div class="en-ai-card-footer"><span>{{ embeddingMessage }}</span><div class="en-ai-actions"><button class="secondary" type="button" @click="loadSearchStatus"><RotateCw aria-hidden="true" /> Refresh status</button><button class="secondary" type="button" :disabled="testing" @click="testRoute('embedding')"><Activity aria-hidden="true" /> Test</button><button class="primary" type="button" :disabled="indexing" @click="rebuildEmbeddings"><DatabaseZap aria-hidden="true" />{{ indexing ? 'Rebuilding…' : 'Rebuild index' }}</button></div></div>
      </section>
    </template>

    <template v-else-if="activePage === 'ocr'">
      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>OCR model</h4><p>Select the route used to extract text from images and PDF pages.</p></div><span class="en-ai-badge active"><ScanText aria-hidden="true" />{{ routeProviderLabel(form.routes.ocr.source) }}</span></header>
        <div class="en-ai-model-row">
          <label class="en-ai-full"><span>Model</span><input v-model.trim="form.routes.ocr.modelRef" list="ocr-model-candidates" type="text" placeholder="Choose or type an OCR model" @change="applyModelChoice('ocr')"></label>
          <datalist id="ocr-model-candidates"><option v-for="candidate in ocrCandidates" :key="candidate.ref" :value="candidate.ref">{{ candidate.label }}</option></datalist>
          <div class="en-ai-route-summary"><span>Provider <strong>{{ routeProviderLabel(form.routes.ocr.source) }}</strong></span><span>Model <strong>{{ form.routes.ocr.model || 'Not selected' }}</strong></span></div>
        </div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Automatic processing</h4><p>Control when OCR runs and which image corrections are applied first.</p></div></header>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>OCR new images automatically</strong><span>Start text extraction when a supported image is added.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.ocr.autoOcr" :class="{ active: form.routes.ocr.autoOcr }" @click="form.routes.ocr.autoOcr = !form.routes.ocr.autoOcr"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Straighten pages</strong><span>Correct rotated or skewed document scans before recognition.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.ocr.deskew" :class="{ active: form.routes.ocr.deskew }" @click="form.routes.ocr.deskew = !form.routes.ocr.deskew"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Reduce image noise</strong><span>Clean compression artifacts and scan noise before recognition.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.ocr.denoise" :class="{ active: form.routes.ocr.denoise }" @click="form.routes.ocr.denoise = !form.routes.ocr.denoise"><span /></button></div>
        <div class="en-ai-setting-row"><div class="en-ai-setting-copy"><strong>Upscale small images</strong><span>Increase image resolution before OCR when source text is too small.</span></div><button class="en-ai-switch" type="button" role="switch" :aria-checked="form.routes.ocr.upscale" :class="{ active: form.routes.ocr.upscale }" @click="form.routes.ocr.upscale = !form.routes.ocr.upscale"><span /></button></div>
      </section>

      <section class="en-ai-card">
        <header class="en-ai-card-header"><div><h4>Recognition output</h4><p>Choose languages, PDF behavior and the format written into notes.</p></div></header>
        <div class="en-ai-form-body en-ai-grid"><label><span>Languages</span><input v-model.trim="form.routes.ocr.languages" type="text" placeholder="eng,fra,heb"></label><label><span>PDF mode</span><select v-model="form.routes.ocr.pdfMode"><option value="missing-text-only">Only pages without text</option><option value="all-pages">All pages</option><option value="skip-text-pdf">Skip text PDFs</option></select></label><label><span>Output format</span><select v-model="form.routes.ocr.output"><option value="markdown">Markdown</option><option value="plain-text">Plain text</option><option value="layout-markdown">Layout Markdown</option></select></label><label><span>Confidence threshold</span><input v-model.number="form.routes.ocr.confidenceThreshold" type="number" min="0" max="1" step="0.01"></label></div>
        <div class="en-ai-card-footer"><span>{{ message }}</span><button class="primary" type="button" :disabled="testing" @click="testRoute('ocr')"><Activity aria-hidden="true" />{{ testing ? 'Testing…' : 'Test OCR route' }}</button></div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Activity,
  ChevronDown,
  Cpu,
  Database,
  DatabaseZap,
  Link2,
  MessageSquare,
  Plus,
  RotateCw,
  Save,
  ScanText,
  Server,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Trash2
} from '@lucide/vue'
import log from '@/platform/runtimeLogShim'
import { normalizeAiConfig, normalizeLocalAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'
import { getModelCapabilities, resolveModelId, resolveModelName } from '../views/modelsViewHelpers'

const CACHE_KEY = 'elephantnote:ai-settings-draft'
const aiPages = Object.freeze([
  { id: 'provider', label: 'Providers', icon: Server },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'embedding', label: 'Search', icon: Database },
  { id: 'ocr', label: 'OCR', icon: ScanText }
])
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
.en-ai-settings { display: grid; gap: 18px; color: var(--en-text, #101828); }
h3, h4, p { margin: 0; }
h3 { font-size: 16px; letter-spacing: -0.02em; }
h4 { font-size: 14px; letter-spacing: -0.01em; }
.en-ai-hero, .en-ai-card { overflow: hidden; border: 1px solid var(--en-border, #c5cfdd); border-radius: 15px; background: var(--en-surface, #fff); box-shadow: 0 1px 2px rgba(2, 6, 23, 0.03); }
.en-ai-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 20px; background: linear-gradient(135deg, color-mix(in srgb, var(--en-primary, #2563eb) 8%, var(--en-surface, #fff)), var(--en-surface, #fff) 62%); }
.en-ai-hero-copy { min-width: 0; display: flex; align-items: flex-start; gap: 13px; }
.en-ai-hero-icon { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 11px; background: var(--en-primary, #2563eb); color: #fff; box-shadow: 0 8px 22px color-mix(in srgb, var(--en-primary, #2563eb) 24%, transparent); }
.en-ai-hero-icon svg { width: 19px; height: 19px; }
.en-ai-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.en-ai-hero-copy p, .en-ai-card-header p, .en-ai-setting-copy span, .en-ai-setting-copy small, .en-ai-empty p { margin-top: 4px; color: var(--en-muted, #667085); font-size: 12px; line-height: 1.45; }
.en-ai-save-status { display: inline-flex; align-items: center; gap: 6px; min-height: 25px; padding: 0 8px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 99px; color: var(--en-muted, #667085); font-size: 10.5px; }
.en-ai-save-status > span { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
.en-ai-save-status.saving > span { background: #f59e0b; animation: pulse 1s ease-in-out infinite; }
.en-ai-top-actions, .en-ai-actions, .en-provider-footer, .en-provider-footer-left, .en-ai-card-footer { display: flex; align-items: center; gap: 8px; }
button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 9px; background: var(--en-surface, #fff); color: var(--en-text, #101828); cursor: pointer; transition: 140ms ease; }
button svg { width: 15px; height: 15px; }
button:hover:not(:disabled) { border-color: var(--en-primary, #2563eb); }
button:disabled { opacity: 0.48; cursor: not-allowed; }
button.primary { border-color: var(--en-primary, #2563eb); background: var(--en-primary, #2563eb); color: #fff; }
button.secondary { background: var(--en-bg, #f7f9fc); }
button.danger { border-color: color-mix(in srgb, var(--en-danger, #dc2626) 35%, var(--en-border, #c5cfdd)); color: var(--en-danger, #dc2626); }
button.compact { min-height: 31px; padding: 0 9px; font-size: 11.5px; }
.en-ai-tabs { display: flex; gap: 5px; padding: 5px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: color-mix(in srgb, var(--en-surface, #fff) 88%, var(--en-bg, #f7f9fc)); }
.en-ai-tabs button { flex: 1; border-color: transparent; background: transparent; color: var(--en-muted, #667085); }
.en-ai-tabs button.active { border-color: var(--en-border, #c5cfdd); background: var(--en-surface, #fff); color: var(--en-text, #101828); box-shadow: 0 1px 4px rgba(2, 6, 23, 0.08); }
.en-ai-card-header { min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border-bottom: 1px solid var(--en-border, #c5cfdd); background: color-mix(in srgb, var(--en-surface, #fff) 94%, var(--en-soft, #e9eff7)); }
.en-ai-badge, .en-provider-state { display: inline-flex; align-items: center; gap: 5px; min-height: 27px; padding: 0 8px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 99px; color: var(--en-muted, #667085); font-size: 10.5px; white-space: nowrap; }
.en-ai-badge.active, .en-provider-state.active { border-color: color-mix(in srgb, #16a34a 28%, var(--en-border, #c5cfdd)); color: #15803d; }
.en-ai-badge svg { width: 13px; height: 13px; }
.en-ai-setting-row { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 18px; }
.en-ai-setting-row + .en-ai-setting-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-ai-setting-copy { min-width: 0; display: grid; gap: 2px; }
.en-ai-setting-copy strong { font-size: 13px; }
.en-ai-setting-copy small { color: var(--en-primary, #2563eb); }
.en-ai-switch { width: 42px; height: 24px; min-height: 24px; flex: 0 0 auto; padding: 2px; border: 0; border-radius: 99px; background: var(--en-border-strong, #aebacd); }
.en-ai-switch > span { width: 20px; height: 20px; display: block; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(2, 6, 23, 0.24); transition: transform 170ms ease; }
.en-ai-switch.active { background: var(--en-primary, #2563eb); }
.en-ai-switch.active > span { transform: translateX(18px); }
.en-ai-switch.small { width: 34px; height: 20px; min-height: 20px; }
.en-ai-switch.small > span { width: 16px; height: 16px; }
.en-ai-switch.small.active > span { transform: translateX(14px); }
.en-provider-list { display: grid; }
.en-provider-row + .en-provider-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-provider-summary { width: 100%; min-height: 66px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 18px; align-items: center; gap: 11px; padding: 12px 18px; border: 0; border-radius: 0; background: transparent; text-align: left; }
.en-provider-summary:hover:not(:disabled) { background: color-mix(in srgb, var(--en-soft, #e9eff7) 55%, transparent); }
.en-provider-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-provider-icon svg { width: 16px; height: 16px; }
.en-provider-copy { min-width: 0; display: grid; gap: 3px; }
.en-provider-copy strong, .en-provider-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.en-provider-copy strong { font-size: 13px; }
.en-provider-copy small { color: var(--en-muted, #667085); font-size: 11px; }
.en-provider-summary > svg { width: 16px; height: 16px; color: var(--en-muted, #667085); transition: transform 150ms ease; }
.en-provider-summary > svg.rotated { transform: rotate(180deg); }
.en-provider-details { padding: 0 18px 16px 63px; }
.en-provider-form, .en-ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-provider-form { padding: 14px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 10px 10px 0 0; background: var(--en-bg, #f7f9fc); }
.en-provider-form .wide { grid-column: 1 / -1; }
.en-provider-footer { justify-content: space-between; padding: 10px 12px; border: 1px solid var(--en-border, #c5cfdd); border-top: 0; border-radius: 0 0 10px 10px; }
.en-provider-footer-left span { color: var(--en-muted, #667085); font-size: 11px; }
.en-ai-empty { min-height: 92px; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 16px 18px; color: var(--en-muted, #667085); }
.en-ai-empty > svg { width: 20px; height: 20px; }
.en-ai-empty strong { color: var(--en-text, #101828); font-size: 13px; }
.en-ai-model-row, .en-ai-form-body { display: grid; gap: 13px; padding: 18px; }
.en-ai-route-summary { display: flex; flex-wrap: wrap; gap: 8px; }
.en-ai-route-summary span { min-height: 27px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 99px; background: var(--en-bg, #f7f9fc); color: var(--en-muted, #667085); font-size: 10.5px; }
.en-ai-route-summary strong { color: var(--en-text, #101828); font-weight: 650; }
.en-ai-full, .en-ai-grid label, .en-provider-form label { min-width: 0; display: grid; gap: 6px; color: var(--en-muted, #667085); font-size: 11.5px; }
input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--en-border, #c5cfdd); border-radius: 9px; background: var(--en-bg, #f7f9fc); color: var(--en-text, #101828); font: inherit; }
input, select { height: 39px; padding: 0 11px; }
textarea { min-height: 110px; padding: 10px 11px; resize: vertical; line-height: 1.5; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid color-mix(in srgb, var(--en-primary, #2563eb) 42%, transparent); outline-offset: 1px; }
.en-ai-advanced { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-ai-advanced summary { min-height: 58px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 0 18px; cursor: pointer; list-style: none; }
.en-ai-advanced summary::-webkit-details-marker { display: none; }
.en-ai-advanced summary > svg:first-child { width: 17px; height: 17px; color: var(--en-primary, #2563eb); }
.en-ai-advanced summary > svg:last-child { width: 16px; height: 16px; color: var(--en-muted, #667085); transition: transform 150ms ease; }
.en-ai-advanced[open] summary > svg:last-child { transform: rotate(180deg); }
.en-ai-advanced summary span { display: grid; gap: 2px; }
.en-ai-advanced summary strong { font-size: 12.5px; }
.en-ai-advanced summary small { color: var(--en-muted, #667085); font-size: 11px; }
.en-ai-advanced .en-ai-grid { padding: 4px 18px 18px 52px; }
.en-ai-card-footer { justify-content: space-between; min-height: 57px; padding: 10px 18px; border-top: 1px solid var(--en-border, #c5cfdd); }
.en-ai-card-footer > span { color: var(--en-muted, #667085); font-size: 11.5px; }
@keyframes pulse { 50% { opacity: 0.35; } }
@media (max-width: 760px) {
  .en-ai-hero { grid-template-columns: 1fr; }
  .en-ai-top-actions { width: 100%; }
  .en-ai-top-actions button { flex: 1; }
  .en-ai-tabs button span { display: none; }
  .en-ai-setting-row { align-items: flex-start; flex-direction: column; }
  .en-provider-form, .en-ai-grid { grid-template-columns: 1fr; }
  .en-provider-form .wide { grid-column: auto; }
  .en-provider-details { padding-left: 18px; }
  .en-provider-footer, .en-ai-card-footer { align-items: flex-start; flex-direction: column; }
  .en-ai-empty { grid-template-columns: 30px minmax(0, 1fr); }
  .en-ai-empty button { grid-column: 2; justify-self: start; }
  .en-ai-advanced .en-ai-grid { padding-left: 18px; }
}
</style>

<template>
  <section class="en-ai-provider-settings">
    <header class="en-ai-provider-header">
      <div>
        <h3>AI settings and providers</h3>
        <p>Model selection is handled by the Model Library. This panel only stores runtime behavior and provider configuration.</p>
      </div>
      <div class="en-ai-actions">
        <button type="button" :disabled="loading" @click="loadConfig">{{ loading ? 'Loading...' : 'Reload' }}</button>
        <button type="button" :disabled="saving" @click="saveConfig">{{ saving ? 'Saving...' : 'Save' }}</button>
      </div>
    </header>

    <section class="en-ai-block">
      <h4>Behavior</h4>
      <div class="en-ai-grid">
        <label><span>Provider</span><select v-model="form.provider"><option value="node-llama-cpp">Local node-llama-cpp</option><option value="openai-compatible">OpenAI-compatible HTTP</option><option value="codex">Codex bridge</option><option value="pi">Pi bridge</option><option value="atomic">Atomic provider registry</option></select></label>
        <label><span>Model hint</span><input v-model.trim="form.model" type="text" placeholder="model name or backend reference" /></label>
        <label><span>Temperature</span><input v-model.number="form.temperature" type="number" min="0" max="2" step="0.05" /></label>
        <label><span>Max tokens</span><input v-model.number="form.maxTokens" type="number" min="1" step="128" /></label>
        <label><span>Context window</span><input v-model.number="form.contextWindow" type="number" min="512" step="512" /></label>
        <label><span>RAG top K</span><input v-model.number="form.ragTopK" type="number" min="1" max="50" /></label>
      </div>
      <div class="en-ai-actions">
        <button type="button" :class="{ active: form.enableRag }" @click="form.enableRag = !form.enableRag">{{ form.enableRag ? 'RAG on' : 'RAG off' }}</button>
        <button type="button" :class="{ active: form.enableTools }" @click="form.enableTools = !form.enableTools">{{ form.enableTools ? 'Tools on' : 'Tools off' }}</button>
        <button type="button" :class="{ active: form.stream }" @click="form.stream = !form.stream">{{ form.stream ? 'Stream on' : 'Stream off' }}</button>
      </div>
      <label class="en-ai-full"><span>System prompt</span><textarea v-model="form.systemPrompt" rows="5" placeholder="Global instructions used by AI features when supported." /></label>
    </section>

    <section class="en-ai-block">
      <h4>HTTP provider</h4>
      <div class="en-ai-grid">
        <label><span>Endpoint</span><input v-model.trim="form.apiEndpoint" type="text" placeholder="https://api.example.com/v1" /></label>
        <label><span>Provider name</span><input v-model.trim="form.apiProvider" type="text" placeholder="openai, openrouter, lmstudio, custom" /></label>
        <label><span>Headers JSON</span><input v-model.trim="form.headersJson" type="text" placeholder='{"Header":"value"}' /></label>
      </div>
    </section>

    <section class="en-ai-block">
      <h4>Codex / Pi / Atomic</h4>
      <div class="en-ai-grid">
        <label><span>Codex command</span><input v-model.trim="form.codexCommand" type="text" placeholder="codex" /></label>
        <label><span>Codex args</span><input v-model.trim="form.codexArgs" type="text" placeholder="--model ..." /></label>
        <label><span>Codex cwd</span><input v-model.trim="form.codexCwd" type="text" placeholder="empty = active vault" /></label>
        <label><span>Pi endpoint</span><input v-model.trim="form.piEndpoint" type="text" placeholder="Pi bridge endpoint or command" /></label>
        <label><span>Atomic provider id</span><input v-model.trim="form.atomicProviderId" type="text" placeholder="provider id" /></label>
        <label><span>Atomic namespace</span><input v-model.trim="form.atomicNamespace" type="text" placeholder="summarize, structure, wiki..." /></label>
      </div>
      <div class="en-ai-actions">
        <button type="button" :disabled="loadingAtomic" @click="loadAtomicProviders">{{ loadingAtomic ? 'Inspecting...' : 'Inspect Atomic providers' }}</button>
        <span>{{ atomicMessage }}</span>
      </div>
      <pre v-if="atomicText">{{ atomicText }}</pre>
    </section>

    <section class="en-ai-block">
      <h4>Test and debug</h4>
      <div class="en-ai-actions">
        <button type="button" :disabled="testing" @click="testConfig">{{ testing ? 'Testing...' : 'Test current config' }}</button>
        <span>{{ message }}</span>
      </div>
      <pre>{{ preview }}</pre>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import log from 'electron-log/renderer'
import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const loadingAtomic = ref(false)
const message = ref('')
const atomicMessage = ref('')
const atomicText = ref('')
const currentConfig = ref(normalizeAiConfig())
const form = ref(defaultForm())

function defaultForm () {
  return { provider: 'node-llama-cpp', model: '', temperature: 0.2, maxTokens: 2048, contextWindow: 8192, ragTopK: 6, enableRag: true, enableTools: true, stream: true, systemPrompt: '', apiEndpoint: '', apiProvider: 'openai-compatible', headersJson: '', codexCommand: 'codex', codexArgs: '', codexCwd: '', piEndpoint: '', atomicProviderId: '', atomicNamespace: '' }
}

const parseJsonObject = (text = '') => {
  if (!String(text).trim()) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch (error) {
    log.warn('[ai-settings] headers-json invalid', error)
    return {}
  }
}

const applyConfig = (config = {}) => {
  log.info('[ai-settings] applyConfig:start', { keys: Object.keys(config || {}) })
  form.value = { ...defaultForm(), provider: config.provider || config.transport || config.preset || 'node-llama-cpp', model: config.model || '', temperature: Number(config.temperature ?? 0.2), maxTokens: Number(config.maxTokens ?? config.max_tokens ?? 2048), contextWindow: Number(config.contextWindow ?? config.context_window ?? 8192), ragTopK: Number(config.ragTopK ?? config.rag?.topK ?? 6), enableRag: config.enableRag ?? config.rag?.enabled ?? true, enableTools: config.enableTools ?? config.tools?.enabled ?? true, stream: config.stream ?? config.streaming ?? true, systemPrompt: config.systemPrompt || config.system || '', apiEndpoint: config.apiEndpoint || config.endpoint || '', apiProvider: config.apiProvider || config.providerName || 'openai-compatible', headersJson: config.headers ? JSON.stringify(config.headers) : '', codexCommand: config.codex?.command || config.codexCommand || 'codex', codexArgs: Array.isArray(config.codex?.args) ? config.codex.args.join(' ') : config.codexArgs || '', codexCwd: config.codex?.cwd || config.codexCwd || '', piEndpoint: config.pi?.endpoint || config.piEndpoint || '', atomicProviderId: config.atomic?.providerId || config.atomicProviderId || '', atomicNamespace: config.atomic?.namespace || config.atomicNamespace || '' }
  log.info('[ai-settings] applyConfig:done', { provider: form.value.provider, model: form.value.model })
}

const buildConfig = () => normalizeAiConfig({ ...clonePlainObject(currentConfig.value), preset: form.value.provider, provider: form.value.provider, transport: form.value.provider, endpoint: form.value.provider === 'node-llama-cpp' ? 'node-llama-cpp://local' : form.value.apiEndpoint, model: form.value.model, temperature: Number(form.value.temperature) || 0, maxTokens: Number(form.value.maxTokens) || 2048, contextWindow: Number(form.value.contextWindow) || 8192, systemPrompt: form.value.systemPrompt, stream: Boolean(form.value.stream), enableRag: Boolean(form.value.enableRag), enableTools: Boolean(form.value.enableTools), apiProvider: form.value.apiProvider, apiEndpoint: form.value.apiEndpoint, headers: parseJsonObject(form.value.headersJson), rag: { enabled: Boolean(form.value.enableRag), topK: Number(form.value.ragTopK) || 6 }, tools: { enabled: Boolean(form.value.enableTools) }, codex: { command: form.value.codexCommand, args: form.value.codexArgs.split(' ').filter(Boolean), cwd: form.value.codexCwd }, pi: { endpoint: form.value.piEndpoint }, atomic: { providerId: form.value.atomicProviderId, namespace: form.value.atomicNamespace } })
const preview = computed(() => JSON.stringify(buildConfig(), null, 2))

const loadConfig = async () => {
  loading.value = true
  message.value = 'Loading AI config...'
  log.info('[ai-settings] loadConfig:start')
  try {
    const config = await elephantnoteClient.ai.getConfig()
    currentConfig.value = normalizeAiConfig(config)
    applyConfig(currentConfig.value)
    message.value = 'AI config loaded.'
    log.info('[ai-settings] loadConfig:done', { provider: form.value.provider, endpoint: form.value.apiEndpoint })
  } catch (error) {
    log.error('[ai-settings] loadConfig:failed', error)
    message.value = error instanceof Error ? error.message : 'Unable to load AI config.'
  } finally {
    loading.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  message.value = 'Saving AI config...'
  const payload = buildConfig()
  log.info('[ai-settings] saveConfig:start', { provider: payload.provider, transport: payload.transport, endpoint: payload.endpoint, model: payload.model, rag: payload.rag, tools: payload.tools })
  try {
    const saved = await elephantnoteClient.ai.setConfig(clonePlainObject(payload))
    currentConfig.value = normalizeAiConfig(saved || payload)
    message.value = 'AI config saved.'
    log.info('[ai-settings] saveConfig:done', { provider: currentConfig.value.provider || currentConfig.value.transport, model: currentConfig.value.model })
  } catch (error) {
    log.error('[ai-settings] saveConfig:failed', error)
    message.value = error instanceof Error ? error.message : 'Unable to save AI config.'
  } finally {
    saving.value = false
  }
}

const testConfig = async () => {
  testing.value = true
  const payload = buildConfig()
  message.value = 'Testing AI config...'
  log.info('[ai-settings] testConfig:start', { provider: payload.provider, transport: payload.transport, endpoint: payload.endpoint, model: payload.model })
  try {
    const result = await elephantnoteClient.ai.testConfig(clonePlainObject(payload))
    message.value = `AI config OK · ${Math.round(result.latencyMs || 0)} ms · ${result.response || 'response received'}`
    log.info('[ai-settings] testConfig:done', result)
  } catch (error) {
    log.error('[ai-settings] testConfig:failed', error)
    message.value = error instanceof Error ? error.message : 'AI endpoint test failed.'
  } finally {
    testing.value = false
  }
}

const loadAtomicProviders = async () => {
  loadingAtomic.value = true
  atomicMessage.value = 'Inspecting Atomic providers...'
  log.info('[ai-settings] loadAtomicProviders:start')
  try {
    const providers = await elephantnoteClient.atomicFeatures.providers()
    atomicText.value = JSON.stringify(providers, null, 2)
    atomicMessage.value = 'Atomic providers loaded.'
    log.info('[ai-settings] loadAtomicProviders:done', providers)
  } catch (error) {
    log.error('[ai-settings] loadAtomicProviders:failed', error)
    atomicMessage.value = error instanceof Error ? error.message : 'Unable to inspect Atomic providers.'
  } finally {
    loadingAtomic.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.en-ai-provider-settings{display:grid;gap:14px}.en-ai-provider-header,.en-ai-block{display:grid;gap:12px;padding:16px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:16px;background:var(--en-card,#252525)}.en-ai-provider-header{grid-template-columns:minmax(0,1fr) auto;align-items:center}.en-ai-provider-header h3,.en-ai-block h4{margin:0}.en-ai-provider-header p{margin:4px 0 0;color:var(--en-muted,#9a9a9a)}.en-ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.en-ai-grid label,.en-ai-full{display:grid;gap:6px;color:var(--en-muted,#9a9a9a)}.en-ai-grid input,.en-ai-grid select,.en-ai-full textarea{width:100%;min-height:38px;padding:0 12px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4)}.en-ai-full textarea{padding:10px 12px;resize:vertical}.en-ai-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.en-ai-actions button{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4);min-height:34px;padding:0 14px}.en-ai-actions button.active{border-color:#4caf5c;color:#c9f6d0;background:rgba(76,175,92,.12)}.en-ai-actions span{color:var(--en-muted,#9a9a9a)}pre{max-height:260px;overflow:auto;padding:12px;border-radius:12px;background:rgba(0,0,0,.25);white-space:pre-wrap;font-size:12px}@media(max-width:760px){.en-ai-provider-header{grid-template-columns:1fr}.en-ai-grid{grid-template-columns:1fr}}
</style>

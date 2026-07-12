<template>
  <section class="en-code-settings-page">
    <section class="en-code-card en-code-primary-card">
      <div class="en-code-card-icon"><Terminal aria-hidden="true" /></div>
      <div class="en-code-card-copy">
        <strong>Local code execution</strong>
        <span>Run fenced code blocks with interpreters installed on this computer.</span>
      </div>
      <span class="en-code-status" :class="{ active: form.executionEnabled }">{{ form.executionEnabled ? 'Enabled' : 'Disabled' }}</span>
      <button class="en-switch" type="button" role="switch" aria-label="Enable local code execution" :aria-checked="form.executionEnabled" :class="{ active: form.executionEnabled }" :disabled="loading || saving" @click="toggleExecution"><span /></button>
    </section>

    <section class="en-code-warning">
      <ShieldAlert aria-hidden="true" />
      <div><strong>Runs with your normal user permissions</strong><span>Executed programs are not sandboxed. Only run code you trust.</span></div>
    </section>

    <section class="en-code-card">
      <header class="en-code-section-header">
        <div><strong>Output</strong><span>Control how much stdout and stderr remains visible in the note.</span></div>
      </header>
      <div class="en-code-row">
        <div><strong>Retained output</strong><span>Keep the final lines when output exceeds the limit.</span></div>
        <select v-model.number="form.outputLineLimit" class="en-compact-select" :disabled="loading || saving" @change="saveConfig('output-limit')">
          <option v-for="limit in OUTPUT_LINE_LIMITS" :key="limit" :value="limit">{{ limit === 5000 ? '5,000 lines' : `${limit} lines` }}</option>
        </select>
      </div>
    </section>

    <section class="en-code-card">
      <header class="en-code-section-header">
        <div><strong>Interpreters</strong><span>Enable runtimes and optionally override their executable path.</span></div>
        <button class="en-code-refresh" type="button" :disabled="loading || saving" @click="loadConfig"><RefreshCw :class="{ spinning: loading }" aria-hidden="true" /> Detect again</button>
      </header>

      <div v-if="loading" class="en-code-empty">Detecting local environments…</div>
      <div v-else-if="!form.environments.length" class="en-code-empty">No interpreter definition is available.</div>
      <article v-for="environment in form.environments" v-else :key="environment.id" class="en-code-environment">
        <div class="en-code-environment-main">
          <div class="en-code-environment-title"><strong>{{ environment.label }}</strong><span class="en-code-status" :class="{ active: environment.available }">{{ environment.available ? 'Detected' : 'Not detected' }}</span></div>
          <span>{{ environment.available ? [environment.version, environment.configuredExecutable ? 'Custom path' : 'Auto-detected'].filter(Boolean).join(' · ') : 'Install the runtime or provide an executable path.' }}</span>
        </div>
        <label class="en-code-path">
          <span>Executable</span>
          <input v-model.trim="environment.configuredExecutable" class="en-compact-input" type="text" :placeholder="environment.executable || 'Executable path'" :disabled="loading || saving" @change="saveConfig(`path:${environment.id}`)">
        </label>
        <button v-if="environment.configuredExecutable" class="en-code-reset" type="button" :disabled="loading || saving" title="Use automatic detection" @click="clearExecutable(environment)"><RotateCcw aria-hidden="true" /></button>
        <button class="en-switch" type="button" role="switch" :aria-label="`Enable ${environment.label}`" :aria-checked="environment.enabled !== false" :class="{ active: environment.enabled !== false }" :disabled="loading || saving" @click="toggleEnvironment(environment)"><span /></button>
      </article>
    </section>

    <p v-if="message" class="en-code-message" :class="{ error: messageIsError }">{{ message }}</p>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { RefreshCw, RotateCcw, ShieldAlert, Terminal } from '@lucide/vue'
import log from '@/platform/runtimeLogShim'

const OUTPUT_LINE_LIMITS = [10, 20, 50, 100, 200, 500, 1000, 5000]
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageIsError = ref(false)
const form = reactive({ executionEnabled: false, outputLineLimit: 200, environments: [] })

const programs = () => {
  const api = globalThis.elephantnote?.programs
  if (!api?.list || !api?.set) throw new Error('Code execution settings API is unavailable')
  return api
}

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 200
  return Math.min(5000, Math.max(10, parsed))
}

const applyState = (state = {}) => {
  form.executionEnabled = state.executionEnabled === true
  form.outputLineLimit = normalizeLimit(state.outputLineLimit)
  form.environments = Array.isArray(state.environments)
    ? state.environments.map((environment) => ({ ...environment, enabled: environment.enabled !== false, configuredExecutable: environment.configuredExecutable || '' }))
    : []
}

const buildPayload = () => ({
  environments: {
    executionEnabled: form.executionEnabled,
    outputLineLimit: normalizeLimit(form.outputLineLimit),
    environments: Object.fromEntries(form.environments.map((environment) => [environment.id, {
      enabled: environment.enabled !== false,
      executable: environment.configuredExecutable || ''
    }]))
  }
})

const loadConfig = async () => {
  if (loading.value) return
  loading.value = true
  message.value = ''
  messageIsError.value = false
  try {
    const state = await programs().list()
    applyState(state)
    log.info('[code-settings] load:done', { environments: form.environments.length, executionEnabled: form.executionEnabled, outputLineLimit: form.outputLineLimit })
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    messageIsError.value = true
    log.error('[code-settings] load:failed', error)
  } finally {
    loading.value = false
  }
}

const saveConfig = async (reason) => {
  if (saving.value) return
  saving.value = true
  message.value = ''
  messageIsError.value = false
  try {
    const result = await programs().set(buildPayload())
    applyState(result)
    log.info('[code-settings] save:done', { reason, executionEnabled: form.executionEnabled, outputLineLimit: form.outputLineLimit })
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    messageIsError.value = true
    log.error('[code-settings] save:failed', { reason, error })
  } finally {
    saving.value = false
  }
}

const toggleExecution = async () => {
  form.executionEnabled = !form.executionEnabled
  await saveConfig('execution-toggle')
}

const toggleEnvironment = async (environment) => {
  environment.enabled = environment.enabled === false
  await saveConfig(`environment-toggle:${environment.id}`)
}

const clearExecutable = async (environment) => {
  environment.configuredExecutable = ''
  await saveConfig(`environment-auto:${environment.id}`)
}

onMounted(loadConfig)
</script>

<style scoped>
.en-code-settings-page { display: grid; gap: 14px; }
.en-code-card { overflow: hidden; border: 1px solid var(--en-border, #c5cfdd); border-radius: 14px; background: var(--en-surface, #fff); }
.en-code-primary-card { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 16px; }
.en-code-card-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-code-card-icon svg { width: 19px; height: 19px; }
.en-code-card-copy, .en-code-section-header > div, .en-code-environment-main, .en-code-row > div { min-width: 0; display: grid; gap: 3px; }
.en-code-card-copy strong, .en-code-section-header strong, .en-code-environment strong, .en-code-row strong, .en-code-warning strong { font-size: 12.5px; }
.en-code-card-copy span, .en-code-section-header span, .en-code-environment-main > span, .en-code-row span, .en-code-warning span { color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.45; }
.en-code-warning { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid color-mix(in srgb, #d97706 38%, var(--en-border, #c5cfdd)); border-radius: 12px; background: color-mix(in srgb, #d97706 7%, var(--en-surface, #fff)); }
.en-code-warning svg { width: 18px; height: 18px; flex: 0 0 auto; color: #d97706; }
.en-code-warning > div { display: grid; gap: 2px; }
.en-code-section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--en-border, #c5cfdd); }
.en-code-row, .en-code-environment { display: grid; align-items: center; gap: 12px; padding: 13px 16px; }
.en-code-row { grid-template-columns: minmax(0, 1fr) auto; }
.en-code-environment { grid-template-columns: minmax(150px, 1fr) minmax(220px, 1.2fr) 30px auto; }
.en-code-environment + .en-code-environment { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-code-environment-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.en-code-path { min-width: 0; display: grid; gap: 4px; }
.en-code-path > span { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-code-path input { width: 100%; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.en-code-status { padding: 3px 7px; border-radius: 999px; background: var(--en-soft, #e9eff7); color: var(--en-muted, #667085); font-size: 9.5px; font-weight: 650; }
.en-code-status.active { background: color-mix(in srgb, #16a34a 14%, transparent); color: #15803d; }
.en-code-refresh, .en-code-reset { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--en-border, #c5cfdd); background: transparent; color: inherit; cursor: pointer; }
.en-code-refresh { min-height: 30px; gap: 6px; padding: 0 10px; border-radius: 8px; font-size: 10.5px; }
.en-code-refresh svg, .en-code-reset svg { width: 14px; height: 14px; }
.en-code-reset { width: 30px; height: 30px; border-radius: 8px; }
.en-code-empty { padding: 22px; color: var(--en-muted, #667085); font-size: 11px; text-align: center; }
.en-code-message { margin: 0; color: var(--en-muted, #667085); font-size: 10.5px; }
.en-code-message.error { color: #b91c1c; }
.spinning { animation: en-code-spin .9s linear infinite; }
@keyframes en-code-spin { to { transform: rotate(360deg); } }
@media (max-width: 780px) {
  .en-code-primary-card { grid-template-columns: 38px minmax(0, 1fr) auto; }
  .en-code-primary-card > .en-switch { grid-column: 3; grid-row: 1 / span 2; }
  .en-code-primary-card > .en-code-status { grid-column: 2; }
  .en-code-environment { grid-template-columns: minmax(0, 1fr) 30px auto; }
  .en-code-path { grid-column: 1 / -1; grid-row: 2; }
}
</style>

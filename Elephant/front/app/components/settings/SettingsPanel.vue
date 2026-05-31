<template>
  <div
    class="en-settings-backdrop"
    :class="`en-theme-${theme}`"
    :style="settingsStyle"
    @click.self="$emit('close')"
  >
    <section
      class="en-settings-panel"
      :style="settingsStyle"
      aria-label="ElephantNote settings"
    >
      <header class="en-settings-header">
        <div>
          <p>ElephantNote</p>
          <h2>Settings</h2>
        </div>
        <button
          class="en-settings-close"
          type="button"
          @click="$emit('close')"
        >
          <X class="en-icon" />
        </button>
      </header>

      <div class="en-settings-grid">
        <aside class="en-settings-nav">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            :class="{ active: activeSection === item.id }"
            @click="activeSection = item.id"
          >
            {{ item.label }}
          </button>
        </aside>

        <div class="en-settings-content">
          <template v-if="activeSection === 'appearance'">
            <section class="en-settings-section">
              <div>
                <h3>Theme</h3>
                <p>Switch the shell and editor surface between light and dark.</p>
              </div>
              <button
                class="en-theme-switch"
                type="button"
                :class="{ dark: theme === 'dark' }"
                @click="$emit('update-theme', theme === 'dark' ? 'light' : 'dark')"
              >
                <SunMedium class="en-theme-icon light" />
                <Moon class="en-theme-icon dark" />
                {{ theme === 'dark' ? 'Dark' : 'Light' }}
              </button>
            </section>

            <section class="en-settings-section">
              <div>
                <h3>Sidebar width</h3>
                <p>The navigation rail can also be resized by dragging its right edge.</p>
              </div>
              <label class="en-settings-range">
                <input
                  type="range"
                  min="184"
                  max="320"
                  :value="sidebarWidth"
                  @input="$emit('update-sidebar-width', Number($event.target.value))"
                >
                <output>{{ sidebarWidth }}px</output>
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'vaults'">
            <section class="en-settings-section">
              <div>
                <h3>Active vault</h3>
                <p>The current vault path is shown here.</p>
              </div>
              <span class="en-settings-pill">{{ activeVaultName }}</span>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Open vaults</h3>
                <p
                  v-for="vault in vaults"
                  :key="vault.id"
                  class="en-settings-path"
                >
                  {{ vault.name }} · {{ vault.path }}
                </p>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'editor'">
            <section class="en-settings-section">
              <div>
                <h3>Editor footer</h3>
                <p>Show the bottom bar with word count, typography controls, and theme shortcut.</p>
              </div>
              <button
                class="en-settings-toggle-pill"
                type="button"
                :class="{ active: preferences.showEditorFooter }"
                @click="setShowEditorFooter(!preferences.showEditorFooter)"
              >
                {{ preferences.showEditorFooter ? 'Visible' : 'Hidden' }}
              </button>
            </section>
            <section class="en-settings-section">
              <div>
                <h3>Tag prefix</h3>
                <p>Show or hide the # prefix before tag names in the note editor.</p>
              </div>
              <button
                class="en-settings-toggle-pill"
                type="button"
                :class="{ active: preferences.showTagHashInEditor }"
                @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)"
              >
                {{ preferences.showTagHashInEditor ? 'Show #' : 'Hide #' }}
              </button>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Autosave</h3>
                <p>Changes are written automatically after a short delay.</p>
              </div>
              <label class="en-settings-range">
                <input
                  type="range"
                  min="250"
                  max="5000"
                  step="250"
                  :value="preferences.autoSaveDelay"
                  @input="setAutoSaveDelay(Number($event.target.value))"
                >
                <output>{{ preferences.autoSaveDelay }} ms</output>
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'import'">
            <section class="en-settings-section">
              <div>
                <h3>Import notes</h3>
                <p>Bring notes from a Google Keep export into the active vault.</p>
              </div>
              <button
                type="button"
                :disabled="isImporting"
                @click="importGoogleKeep"
              >
                <Download class="en-icon" />
                {{ isImporting ? 'Importing...' : 'Import Google Keep' }}
              </button>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Sources</h3>
                <p>Ingest a web page or RSS feed into local markdown notes.</p>
              </div>
              <div class="en-form-grid">
                <label>
                  <span>URL</span>
                  <input
                    v-model.trim="sourceUrl"
                    type="text"
                    placeholder="https://example.com/article"
                  >
                </label>
                <label>
                  <span>Destination folder</span>
                  <input
                    v-model.trim="sourceDestination"
                    type="text"
                    placeholder="Sources"
                  >
                </label>
              </div>
              <div class="en-settings-actions-row">
                <button
                  type="button"
                  :disabled="isImportingSource || !sourceUrl"
                  @click="ingestSourceUrl"
                >Import URL</button>
                <button
                  type="button"
                  :disabled="isImportingSource || !sourceUrl"
                  @click="importRssSource"
                >Import RSS</button>
                <span class="en-settings-message">{{ sourceImportMessage || importMessage }}</span>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'sites'">
            <section class="en-settings-section stacked">
              <div>
                <h3>Generated sites</h3>
                <p>Manage the current folder website preview.</p>
              </div>
              <div class="en-settings-actions-row">
                <button
                  type="button"
                  :class="{ active: featureFlags.sitePreview }"
                  @click="toggleFeature('sitePreview')"
                >{{ featureFlags.sitePreview ? 'Enabled' : 'Disabled' }}</button>
                <span class="en-settings-pill">{{ siteStatusLabel }}</span>
                <button
                  type="button"
                  :disabled="!sitePreviewStore.previewUrl"
                  @click="sitePreviewStore.openPreviewExternal"
                >Open</button>
                <button
                  type="button"
                  :disabled="!sitePreviewStore.info"
                  @click="stopSitePreview"
                >Stop</button>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'sync'">
            <section class="en-settings-section stacked">
              <div>
                <h3>Git sync</h3>
                <p>Synchronize vault changes through Git.</p>
              </div>
              <button
                type="button"
                :class="{ active: featureFlags.gitSync }"
                @click="toggleFeature('gitSync')"
              >Git sync {{ featureFlags.gitSync ? 'enabled' : 'disabled' }}</button>
            </section>
          </template>

          <template v-else-if="activeSection === 'ai'">
            <section class="en-ai-shell">
              <header class="en-ai-header">
                <div>
                  <h3>AI</h3>
                  <p>Models, providers, audio, tasks, agent access and semantic search in one place.</p>
                </div>
                <button
                  type="button"
                  :class="{ active: featureFlags.ai }"
                  @click="toggleFeature('ai')"
                >AI {{ featureFlags.ai ? 'enabled' : 'disabled' }}</button>
              </header>

              <nav class="en-ai-tabs">
                <button
                  v-for="tab in aiTabs"
                  :key="tab.id"
                  type="button"
                  :class="{ active: activeAiTab === tab.id }"
                  @click="activeAiTab = tab.id"
                >{{ tab.label }}</button>
              </nav>

              <section
                v-if="activeAiTab === 'providers'"
                class="en-settings-section stacked"
              >
                <div>
                  <h3>Provider endpoint</h3>
                  <p>Use Ollama, LM Studio, a local OpenAI-compatible server, or a Codex-compatible bridge.</p>
                </div>
                <div class="en-ai-provider-grid">
                  <button
                    v-for="preset in aiPresets"
                    :key="preset.id"
                    type="button"
                    :class="{ active: aiConfig.preset === preset.id }"
                    @click="applyAiPreset(preset)"
                  >{{ preset.label }}</button>
                </div>
                <div class="en-form-grid">
                  <label>
                    <span>Endpoint</span>
                    <input
                      v-model.trim="aiConfig.endpoint"
                      type="text"
                      placeholder="http://127.0.0.1:11434/api/chat"
                    >
                  </label>
                  <label>
                    <span>Model</span>
                    <input
                      v-model.trim="aiConfig.model"
                      type="text"
                      placeholder="llama3.2"
                    >
                  </label>
                  <label>
                    <span>Transport</span>
                    <select v-model="aiConfig.transport">
                      <option value="openai-compatible">OpenAI compatible</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </label>
                  <label>
                    <span>API key</span>
                    <input
                      v-model.trim="aiConfig.apiKey"
                      type="password"
                      placeholder="Optional"
                    >
                  </label>
                </div>
                <div class="en-settings-actions-row">
                  <button
                    type="button"
                    :disabled="isSavingAiConfig"
                    @click="saveAiConfig"
                  >{{ isSavingAiConfig ? 'Saving...' : 'Save endpoint' }}</button>
                  <span class="en-settings-message">{{ aiConfigMessage }}</span>
                </div>
              </section>

              <section
                v-else-if="activeAiTab === 'models'"
                class="en-settings-section stacked"
              >
                <div>
                  <h3>Model management</h3>
                  <p>Default is No model. Installable Ollama models are stored per vault in <code>.elephantnote/models</code>.</p>
                </div>

                <article
                  v-for="group in modelGroups"
                  :key="group.id"
                  class="en-model-category"
                >
                  <header>
                    <div>
                      <h4>{{ group.label }}</h4>
                      <p>{{ group.description }}</p>
                    </div>
                  </header>
                  <div class="en-model-slot-grid">
                    <label
                      v-for="purpose in group.purposes"
                      :key="purpose"
                    >
                      <span>{{ formatPurpose(purpose) }}</span>
                      <select v-model="modelSelection[purpose]">
                        <option value="">No model</option>
                        <option
                          v-for="model in getModelsForPurpose(purpose)"
                          :key="model.id"
                          :value="model.id"
                        >
                          {{ model.name }} · {{ model.provider }} · {{ model.size }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="en-model-catalog compact">
                    <article
                      v-for="model in getModelsForCategory(group.id)"
                      :key="model.id"
                    >
                      <header>
                        <strong>{{ model.name }}</strong>
                        <span>{{ model.purpose }} · {{ model.size }}</span>
                      </header>
                      <p>{{ model.notes }}</p>
                      <button
                        type="button"
                        :disabled="!model.pull"
                        @click="pullAtomicModel(model.id)"
                      >{{ model.pull ? 'Install in vault' : 'External' }}</button>
                    </article>
                  </div>
                </article>

                <div class="en-settings-actions-row">
                  <button
                    type="button"
                    @click="saveModelSelection"
                  >Save model slots</button>
                  <button
                    type="button"
                    @click="loadLocalModels"
                  >Scan vault models</button>
                  <span class="en-settings-message">{{ modelRuntimeMessage || modelSelectionMessage }}</span>
                </div>
                <p
                  v-if="modelDir"
                  class="en-settings-path"
                >Vault model directory: {{ modelDir }}</p>
                <p
                  v-if="localModels.length"
                  class="en-settings-path"
                >Local: {{ localModels.map((model) => model.name).join(', ') }}</p>
              </section>

              <section
                v-else-if="activeAiTab === 'search'"
                class="en-ai-search"
              >
                <div class="en-settings-section stacked">
                  <div>
                    <h3>Search model slot</h3>
                    <p>Semantic search uses the Embedding / Search slot. Keep it on No model to use the current built-in indexer.</p>
                  </div>
                  <label>
                    <span>Embedding model</span>
                    <select v-model="modelSelection.embedding">
                      <option value="">No model / built-in</option>
                      <option
                        v-for="model in getModelsForPurpose('embedding')"
                        :key="model.id"
                        :value="model.id"
                      >{{ model.name }} · {{ model.size }}</option>
                    </select>
                  </label>
                  <div class="en-settings-actions-row">
                    <button
                      type="button"
                      @click="saveModelSelection"
                    >Save search model</button>
                  </div>
                </div>
                <search-settings-panel />
              </section>

              <section
                v-else-if="activeAiTab === 'audio'"
                class="en-settings-section stacked"
              >
                <div>
                  <h3>Audio workflow</h3>
                  <p>Audio uses the same model slots as future microphone and read-aloud tools.</p>
                </div>
                <div class="en-audio-grid">
                  <article>
                    <Mic class="en-icon" />
                    <strong>Speech to text</strong>
                    <span>{{ selectedModelName('speech-to-text') }}</span>
                  </article>
                  <article>
                    <Volume2 class="en-icon" />
                    <strong>Text to speech</strong>
                    <span>{{ selectedModelName('text-to-speech') }}</span>
                  </article>
                </div>
              </section>

              <section
                v-else-if="activeAiTab === 'tasks'"
                class="en-settings-section stacked"
              >
                <div>
                  <h3>Tasks</h3>
                  <p>Create simple task definitions now. Runtime execution is intentionally still limited.</p>
                </div>
                <div class="en-form-grid">
                  <label>
                    <span>Name</span>
                    <input
                      v-model.trim="newTask.name"
                      type="text"
                      placeholder="Auto clean inbox"
                    >
                  </label>
                  <label>
                    <span>Cadence</span>
                    <select v-model="newTask.cadence">
                      <option value="manual">Manual</option>
                      <option value="on-import">On import</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                </div>
                <label class="en-full-label">
                  <span>Description / prompt</span>
                  <textarea
                    v-model.trim="newTask.prompt"
                    rows="4"
                    placeholder="Describe what the LLM should do with notes, search, tags or wiki pages."
                  />
                </label>
                <div class="en-settings-actions-row">
                  <button
                    type="button"
                    :disabled="!newTask.name || !newTask.prompt"
                    @click="createTask"
                  >Add task</button>
                  <span class="en-settings-message">{{ taskMessage }}</span>
                </div>
                <div class="en-task-list">
                  <article
                    v-for="task in taskTemplates"
                    :key="task.id"
                  >
                    <header>
                      <strong>{{ task.name }}</strong>
                      <button
                        type="button"
                        :class="{ active: task.enabled }"
                        @click="toggleTask(task)"
                      >{{ task.enabled ? 'Enabled' : 'Disabled' }}</button>
                    </header>
                    <p>{{ task.description || task.prompt || task.actions.join(' -> ') }}</p>
                    <small>{{ task.cadence }} · {{ task.actions.join(' -> ') || 'llm:prompt' }}</small>
                    <button
                      type="button"
                      @click="runTask(task)"
                    >Run now</button>
                  </article>
                </div>
              </section>

              <section
                v-else-if="activeAiTab === 'api'"
                class="en-settings-section stacked"
              >
                <div>
                  <h3>Agent and database access</h3>
                  <p>This is the bridge for future agents such as Codex: they should access vault data through approved API actions instead of reading arbitrary files.</p>
                </div>
                <div class="en-api-summary">
                  <article>
                    <strong>Database</strong>
                    <span>Vault-local files and indexes under <code>.elephantnote</code></span>
                  </article>
                  <article>
                    <strong>Agent access</strong>
                    <span>Search, notes, wiki, summaries, model metadata and graph actions</span>
                  </article>
                  <article>
                    <strong>Safety boundary</strong>
                    <span>Writes go through explicit API actions; direct uncontrolled DB writes are avoided.</span>
                  </article>
                </div>
                <button
                  type="button"
                  @click="loadAtomicApi"
                >Inspect available actions</button>
                <pre v-if="atomicApiText">{{ atomicApiText }}</pre>
              </section>
            </section>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Download, Mic, Moon, SunMedium, Volume2, X } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_AI_PRESETS, normalizeAiConfig } from 'common/elephantnote/aiProviders'
import {
  ATOMIC_MODEL_CATALOG,
  MODEL_GROUPS,
  MODEL_PURPOSES,
  PROGRAMMATIC_TASK_TEMPLATES,
  createDefaultModelSelection,
  getModelsByCategory,
  getModelsByPurpose
} from 'common/elephantnote/atomicWorkspace'
import SearchSettingsPanel from '../../search/SearchSettingsPanel.vue'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const props = defineProps({
  theme: { type: String, required: true },
  sidebarWidth: { type: Number, required: true },
  vaults: { type: Array, default: () => [] },
  activeVaultName: { type: String, default: 'No vault' },
  activeVaultPath: { type: String, default: '' }
})

defineEmits(['close', 'update-theme', 'update-sidebar-width'])

const sections = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'vaults', label: 'Vaults' },
  { id: 'editor', label: 'Editor' },
  { id: 'import', label: 'Import' },
  { id: 'sites', label: 'Sites' },
  { id: 'sync', label: 'Sync' },
  { id: 'ai', label: 'AI' }
]

const aiTabs = [
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'search', label: 'Search' },
  { id: 'audio', label: 'Audio' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'api', label: 'Agent API' }
]

const activeSection = ref('appearance')
const activeAiTab = ref('providers')
const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const activeVaultPath = computed(() => props.activeVaultPath)
const preferences = usePreferencesStore()
const sitePreviewStore = useSitePreviewStore()
const aiPresets = Object.values(ELEPHANTNOTE_AI_PRESETS)
const aiConfig = ref(normalizeAiConfig())
const featureFlags = ref({ ai: true, askAi: true, sitePreview: true, gitSync: false, agents: true, semanticSearch: true })
const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const importMessage = ref('')
const isImporting = ref(false)
const isImportingSource = ref(false)
const aiConfigMessage = ref('')
const isSavingAiConfig = ref(false)
const modelPurposes = MODEL_PURPOSES
const modelGroups = ref(MODEL_GROUPS)
const modelCatalog = ref(ATOMIC_MODEL_CATALOG)
const recommendedModels = ref([])
const modelSelection = ref(createDefaultModelSelection())
const modelSelectionMessage = ref('')
const modelRuntimeMessage = ref('')
const modelDir = ref('')
const localModels = ref([])
const taskTemplates = ref(PROGRAMMATIC_TASK_TEMPLATES)
const taskMessage = ref('')
const atomicApiText = ref('')
const newTask = ref({ name: '', cadence: 'manual', prompt: '' })

const siteStatusLabel = computed(() => {
  if (sitePreviewStore.previewUrl) return 'Preview running'
  if (sitePreviewStore.lastBuild?.outputDir) return 'Static build ready'
  return 'No generated site active'
})

const settingsStyle = computed(() => theme.value === 'dark'
  ? { '--en-bg': '#0f141d', '--en-surface': '#141a24', '--en-sidebar-bg': '#101722', '--en-soft': '#1b2432', '--en-soft-strong': '#202b3b', '--en-border': '#283244', '--en-border-strong': '#3a465a', '--en-text': '#eef3fb', '--en-muted': '#98a3b6', '--en-subtle': '#7f8aa0', '--en-primary': '#5ea1ff', '--en-card-shadow': '0 18px 44px rgba(0, 0, 0, 0.28)' }
  : { '--en-bg': '#f7f9fc', '--en-surface': '#ffffff', '--en-sidebar-bg': '#edf2f7', '--en-soft': '#e9eff7', '--en-soft-strong': '#dfe7f1', '--en-border': '#c5cfdd', '--en-border-strong': '#aebacd', '--en-text': '#101828', '--en-muted': '#475467', '--en-subtle': '#667085', '--en-primary': '#2563eb', '--en-card-shadow': '0 30px 90px rgba(15, 23, 42, 0.22)' })

const setAutoSaveDelay = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'autoSaveDelay', value })
const setShowEditorFooter = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'showEditorFooter', value })
const setShowTagHashInEditor = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'showTagHashInEditor', value })

const importGoogleKeep = async () => {
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await elephantnoteClient.imports.googleKeep()
    if (!result?.canceled) importMessage.value = `Imported ${result.imported || 0} note${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    importMessage.value = error instanceof Error ? error.message : 'Import failed.'
  } finally {
    isImporting.value = false
  }
}

const ingestSourceUrl = async () => {
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.ingestUrl(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.source?.title || 'source'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'Source import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const importRssSource = async () => {
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.importRss(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const stopSitePreview = async () => {
  await sitePreviewStore.stopPreview()
  sitePreviewStore.clear()
}

const toggleFeature = async (key) => {
  try {
    featureFlags.value = await elephantnoteClient.features.set(key, !featureFlags.value[key])
  } catch (error) {
    console.warn('Unable to update ElephantNote feature flag:', error)
  }
}

const applyAiPreset = (preset) => {
  aiConfig.value = normalizeAiConfig({ ...aiConfig.value, ...preset, preset: preset.id, name: preset.label, apiKey: aiConfig.value.apiKey })
  aiConfigMessage.value = ''
}

const saveAiConfig = async () => {
  isSavingAiConfig.value = true
  try {
    aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.setConfig(aiConfig.value))
    aiConfigMessage.value = 'Endpoint saved.'
  } catch (error) {
    aiConfigMessage.value = error instanceof Error ? error.message : 'AI endpoint save failed.'
  } finally {
    isSavingAiConfig.value = false
  }
}

const formatPurpose = (purpose) => purpose.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
const getModelsForPurpose = (purpose) => getModelsByPurpose(purpose, modelCatalog.value)
const getModelsForCategory = (category) => getModelsByCategory(category, modelCatalog.value)
const selectedModelName = (purpose) => modelCatalog.value.find((item) => item.id === modelSelection.value[purpose])?.name || 'Not selected'

const saveModelSelection = async () => {
  try {
    modelSelection.value = { ...createDefaultModelSelection(), ...(await elephantnoteClient.models.setSelection(modelSelection.value)) }
    modelSelectionMessage.value = 'Model slots saved.'
  } catch (error) {
    window.localStorage.setItem('elephantnote:atomicModelSelection', JSON.stringify(modelSelection.value))
    modelSelectionMessage.value = error instanceof Error ? `${error.message} Saved locally.` : 'Model slots saved locally.'
  }
}

const loadLocalModels = async () => {
  try {
    const result = await elephantnoteClient.atomicFeatures.listLocalModels(activeVaultPath.value)
    localModels.value = result.models || []
    modelDir.value = result.modelDir || ''
    modelRuntimeMessage.value = result.available ? `${localModels.value.length} vault model${localModels.value.length === 1 ? '' : 's'} found.` : result.error || 'Local model runtime not available.'
  } catch (error) {
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Unable to scan local models.'
  }
}

const pullAtomicModel = async (id) => {
  modelRuntimeMessage.value = 'Downloading model into vault...'
  try {
    const result = await elephantnoteClient.atomicFeatures.pullModel(id, 'ollama', activeVaultPath.value)
    modelRuntimeMessage.value = result.message || 'Model download finished.'
    modelDir.value = result.modelDir || modelDir.value
    await loadLocalModels()
  } catch (error) {
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Model download failed.'
  }
}

const loadAtomicCatalog = async () => {
  try {
    const catalog = await elephantnoteClient.atomicFeatures.providers()
    recommendedModels.value = catalog.recommendedModels || []
    modelCatalog.value = catalog.recommendedModels?.length ? catalog.recommendedModels : ATOMIC_MODEL_CATALOG
    modelGroups.value = catalog.modelGroups?.length ? catalog.modelGroups : MODEL_GROUPS
  } catch {
    recommendedModels.value = ATOMIC_MODEL_CATALOG
  }
}

const loadModelSelection = async () => {
  try {
    modelSelection.value = { ...createDefaultModelSelection(), ...(await elephantnoteClient.models.getSelection()) }
  } catch {
    modelSelection.value = createDefaultModelSelection()
  }
}

const loadTasks = async () => {
  try {
    taskTemplates.value = await elephantnoteClient.tasks.list()
  } catch (error) {
    console.warn('Unable to load ElephantNote tasks:', error)
  }
}

const createTask = async () => {
  const id = newTask.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `task-${Date.now()}`
  try {
    taskTemplates.value = await elephantnoteClient.tasks.set({
      id,
      name: newTask.value.name,
      description: newTask.value.prompt,
      prompt: newTask.value.prompt,
      cadence: newTask.value.cadence,
      enabled: true,
      actions: ['llm:prompt']
    })
    newTask.value = { name: '', cadence: 'manual', prompt: '' }
    taskMessage.value = 'Task added.'
  } catch (error) {
    taskMessage.value = error instanceof Error ? error.message : 'Task creation failed.'
  }
}

const toggleTask = async (task) => {
  try {
    taskTemplates.value = await elephantnoteClient.tasks.set({ ...task, enabled: !task.enabled })
  } catch (error) {
    taskMessage.value = error instanceof Error ? error.message : 'Task update failed.'
  }
}

const runTask = async (task) => {
  try {
    taskTemplates.value = await elephantnoteClient.tasks.run(task.id)
    taskMessage.value = `${task.name} finished.`
  } catch (error) {
    taskMessage.value = error instanceof Error ? error.message : 'Task run failed.'
  }
}

const loadAtomicApi = async () => {
  try {
    atomicApiText.value = JSON.stringify(await elephantnoteClient.atomicFeatures.describeApi(), null, 2)
  } catch (error) {
    atomicApiText.value = error instanceof Error ? error.message : 'Unable to inspect API.'
  }
}

onMounted(async () => {
  try { featureFlags.value = await elephantnoteClient.features.get() } catch {}
  try { aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.getConfig()) } catch {}
  await Promise.allSettled([loadAtomicCatalog(), loadModelSelection(), loadTasks(), loadLocalModels()])
})
</script>

<style scoped>
.en-settings-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(8, 12, 18, 0.34); }
.en-settings-panel { width: min(1040px, calc(100vw - 48px)); max-height: min(820px, calc(100vh - 48px)); display: flex; flex-direction: column; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); box-shadow: var(--en-card-shadow); overflow: hidden; }
.en-settings-header { min-height: 88px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 22px; border-bottom: 1px solid var(--en-border); background: color-mix(in srgb, var(--en-surface) 92%, var(--en-bg)); }
.en-settings-header p, .en-settings-header h2 { margin: 0; }
.en-settings-header p { color: var(--en-muted); font-size: 13px; font-weight: 700; }
.en-settings-header h2 { margin-top: 4px; color: var(--en-text); font-size: 26px; line-height: 1.1; }
.en-settings-close { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--en-border); border-radius: 8px; color: var(--en-muted); background: transparent; cursor: pointer; }
.en-settings-close:hover { color: var(--en-text); background: var(--en-soft); }
.en-settings-grid { min-height: 0; flex: 1; display: grid; grid-template-columns: 188px minmax(0, 1fr); }
.en-settings-nav { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-right: 1px solid var(--en-border); background: var(--en-sidebar-bg); overflow: auto; }
.en-settings-nav button, .en-ai-tabs button { min-height: 36px; border: 1px solid transparent; border-radius: 8px; padding: 0 10px; color: var(--en-muted); background: transparent; cursor: pointer; text-align: left; }
.en-settings-nav button.active, .en-ai-tabs button.active { color: var(--en-text); border-color: var(--en-border); background: var(--en-soft); }
.en-settings-content { min-height: 0; overflow: auto; padding: 18px; }
.en-settings-section { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 18px; align-items: center; padding: 16px; border: 1px solid var(--en-border); border-radius: 12px; background: var(--en-bg); margin-bottom: 12px; }
.en-settings-section.stacked { display: block; }
.en-settings-section h3, .en-ai-header h3 { margin: 0; color: var(--en-text); font-size: 17px; }
.en-settings-section h4 { margin: 0; color: var(--en-text); font-size: 15px; }
.en-settings-section p, .en-ai-header p { margin: 5px 0 0; color: var(--en-muted); line-height: 1.45; }
button { cursor: pointer; }
.en-settings-section button, .en-settings-actions-row button, .en-theme-switch, .en-ai-provider-grid button, .en-model-catalog button, .en-task-list button, .en-ai-header button { min-height: 34px; border: 1px solid var(--en-border); border-radius: 8px; padding: 0 12px; color: var(--en-text); background: var(--en-bg); }
button.active { background: var(--en-soft-strong); border-color: var(--en-border-strong); }
button:disabled { opacity: 0.55; cursor: not-allowed; }
.en-settings-range { display: flex; gap: 10px; align-items: center; }
.en-settings-pill, .en-settings-message, .en-settings-path { color: var(--en-muted); }
.en-form-grid, .en-model-slot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
.en-form-grid label, .en-model-slot-grid label, .en-full-label { display: grid; gap: 5px; color: var(--en-muted); }
input, select, textarea { min-height: 34px; border: 1px solid var(--en-border); border-radius: 8px; padding: 0 10px; color: var(--en-text); background: var(--en-surface); }
textarea { padding: 10px; resize: vertical; }
.en-settings-actions-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
.en-ai-shell { display: grid; gap: 12px; }
.en-ai-header { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 16px; border: 1px solid var(--en-border); border-radius: 12px; background: var(--en-bg); }
.en-ai-tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; border: 1px solid var(--en-border); border-radius: 12px; background: var(--en-bg); }
.en-ai-provider-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.en-model-category { border: 1px solid var(--en-border); border-radius: 12px; padding: 14px; background: var(--en-surface); margin-top: 12px; }
.en-model-catalog, .en-task-list, .en-audio-grid, .en-api-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
.en-model-catalog.compact { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.en-model-catalog article, .en-task-list article, .en-audio-grid article, .en-api-summary article { border: 1px solid var(--en-border); border-radius: 12px; padding: 12px; background: var(--en-bg); }
.en-model-catalog header, .en-task-list header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.en-model-catalog span, .en-model-catalog p, .en-task-list p, .en-task-list small, .en-audio-grid span, .en-api-summary span { color: var(--en-muted); }
.en-icon { width: 17px; height: 17px; vertical-align: middle; }
.en-ai-search :deep(.en-search-settings) { margin: 0; }
pre { white-space: pre-wrap; max-height: 320px; overflow: auto; padding: 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); color: var(--en-text); }
code { color: var(--en-primary); }
@media (max-width: 760px) { .en-settings-grid { grid-template-columns: 1fr; } .en-settings-nav { flex-direction: row; border-right: 0; border-bottom: 1px solid var(--en-border); } .en-settings-section { grid-template-columns: 1fr; } }
</style>

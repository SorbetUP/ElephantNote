<template>
  <div
    class="en-settings-backdrop"
    :class="[`en-theme-${themeMode}`, `en-theme-${themeClassId}`]"
    :style="settingsStyle"
    @click.self="$emit('close')"
  >
    <section class="en-settings-panel" :style="settingsStyle" aria-label="ElephantNote settings">
      <header class="en-settings-header">
        <div>
          <p>ElephantNote</p>
          <h2>Settings</h2>
        </div>
        <button class="en-settings-close" type="button" @click="$emit('close')">
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
                <p>{{ activeThemeLabel }}</p>
              </div>
              <button class="en-theme-switch" type="button" :class="{ dark: themeMode === 'dark' }" @click="emit('update-theme', oppositeTheme)">
                <SunMedium class="en-theme-icon light" />
                <Moon class="en-theme-icon dark" />
                {{ themeMode === 'dark' ? 'Dark' : 'Light' }}
              </button>
            </section>

            <section class="en-settings-section stacked">
              <div>
                <h3>Graphic themes</h3>
                <p>Choose a visual family. Each family keeps matching light and dark variants.</p>
              </div>
              <div class="en-theme-grid">
                <button
                  v-for="family in themeFamilies"
                  :key="family.id"
                  type="button"
                  class="en-theme-card"
                  :class="{ active: activeThemeFamily.id === family.id }"
                  @click="emit('update-theme', getThemeVariant(family.id, themeMode))"
                >
                  <span class="en-theme-card-preview">
                    <i v-for="swatch in family.swatches" :key="swatch" :style="{ backgroundColor: swatch }" />
                  </span>
                  <span class="en-theme-card-copy">
                    <strong>{{ family.name }}</strong>
                    <small>{{ family.description }}</small>
                  </span>
                </button>
              </div>
            </section>

            <section class="en-settings-section">
              <div>
                <h3>Sidebar width</h3>
                <p>The navigation rail can also be resized by dragging its right edge.</p>
              </div>
              <label class="en-settings-range">
                <input type="range" min="184" max="320" :value="sidebarWidth" @input="$emit('update-sidebar-width', Number($event.target.value))" />
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
                <p v-for="vault in vaults" :key="vault.id" class="en-settings-path">
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
              <button class="en-settings-toggle-pill" type="button" :class="{ active: preferences.showEditorFooter }" @click="setShowEditorFooter(!preferences.showEditorFooter)">
                {{ preferences.showEditorFooter ? 'Visible' : 'Hidden' }}
              </button>
            </section>
            <section class="en-settings-section">
              <div>
                <h3>Tag prefix</h3>
                <p>Show or hide the # prefix before tag names in the note editor.</p>
              </div>
              <button class="en-settings-toggle-pill" type="button" :class="{ active: preferences.showTagHashInEditor }" @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)">
                {{ preferences.showTagHashInEditor ? 'Show #' : 'Hide #' }}
              </button>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Autosave</h3>
                <p>Changes are written automatically after a short delay.</p>
              </div>
              <label class="en-settings-range">
                <input type="range" min="250" max="5000" step="250" :value="preferences.autoSaveDelay" @input="setAutoSaveDelay(Number($event.target.value))" />
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
              <button type="button" :disabled="isImporting" @click="importGoogleKeep">
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
                  <input v-model.trim="sourceUrl" type="text" placeholder="https://example.com/article" />
                </label>
                <label>
                  <span>Destination folder</span>
                  <input v-model.trim="sourceDestination" type="text" placeholder="Sources" />
                </label>
              </div>
              <div class="en-settings-actions-row">
                <button type="button" :disabled="isImportingSource || !sourceUrl" @click="ingestSourceUrl">Import URL</button>
                <button type="button" :disabled="isImportingSource || !sourceUrl" @click="importRssSource">Import RSS</button>
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
                <button type="button" :class="{ active: featureFlags.sitePreview }" @click="toggleFeature('sitePreview')">
                  {{ featureFlags.sitePreview ? 'Enabled' : 'Disabled' }}
                </button>
                <span class="en-settings-pill">{{ siteStatusLabel }}</span>
                <button type="button" :disabled="!sitePreviewStore.previewUrl" @click="sitePreviewStore.openPreviewExternal">Open</button>
                <button type="button" :disabled="!sitePreviewStore.info" @click="stopSitePreview">Stop</button>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'sync'">
            <section class="en-settings-section stacked">
              <div>
                <h3>Synchronization</h3>
                <p>Pair devices with Syncthing over the local network. Git is only used locally to order snapshots.</p>
              </div>
              <div class="en-sync-status-grid">
                <article class="en-sync-status-card" :class="{ ok: syncStatus.deviceId }">
                  <GitBranch class="en-icon" />
                  <div><strong>Local Git history</strong><span>{{ syncStatus.branch || 'No branch yet' }}</span></div>
                </article>
                <article class="en-sync-status-card" :class="{ ok: syncStatus.syncthing?.connected, warn: syncStatus.syncthing?.configured && !syncStatus.syncthing?.connected }">
                  <Wifi class="en-icon" />
                  <div><strong>{{ syncStatus.syncthing?.connected ? 'Syncthing connected' : 'Syncthing offline' }}</strong><span>{{ syncStatus.syncthing?.folderState || syncStatus.syncthing?.lastError || 'Waiting for configuration' }}</span></div>
                </article>
                <article class="en-sync-status-card" :class="{ warn: syncStatus.dirty || syncStatus.queued }">
                  <RefreshCw class="en-icon" />
                  <div><strong>{{ syncStatus.dirty ? 'Local changes' : 'Vault clean' }}</strong><span>{{ syncStatus.queued || 0 }} queued · Git history local</span></div>
                </article>
              </div>
              <div class="en-form-grid">
                <label><span>Backend</span><select v-model="syncForm.backend"><option value="git">Local Git only</option><option value="syncthing-git">Syncthing LAN + local Git</option></select></label>
                <label><span>Branch</span><input v-model.trim="syncForm.branch" type="text" placeholder="main" /></label>
                <label><span>Peer device ID</span><input v-model.trim="syncForm.peerDeviceId" type="text" placeholder="Syncthing device ID" /></label>
                <label><span>Peer address / IP</span><input v-model.trim="syncForm.peerAddress" type="text" placeholder="tcp://192.168.1.42:22000 or dynamic" /></label>
                <label><span>Syncthing REST endpoint</span><input v-model.trim="syncForm.syncthingEndpoint" type="text" placeholder="http://127.0.0.1:8384" /></label>
                <label><span>Syncthing API key</span><input v-model.trim="syncForm.syncthingApiKey" type="password" autocomplete="off" placeholder="Optional" /></label>
              </div>
              <div class="en-settings-actions-row">
                <button type="button" :class="{ active: featureFlags.gitSync }" @click="toggleFeature('gitSync')">{{ featureFlags.gitSync ? 'Sync enabled' : 'Sync disabled' }}</button>
                <button type="button" :disabled="isSyncRunning" @click="configureSync"><Server class="en-icon" />{{ isSyncRunning ? 'Configuring...' : 'Configure' }}</button>
                <button type="button" :disabled="isSyncRunning" @click="runSync"><RefreshCw class="en-icon" />{{ isSyncRunning ? 'Synchronizing...' : 'Sync now' }}</button>
                <button type="button" :disabled="isSyncRunning" @click="loadSyncStatus">Refresh status</button>
                <span class="en-settings-message">{{ syncMessage }}</span>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'ai'">
            <section class="en-ai-shell">
              <header class="en-ai-header">
                <div>
                  <h3>AI routing</h3>
                  <p>The Model Library handles search, download, install and uninstall. These settings only choose which installed model each app feature uses.</p>
                </div>
                <div class="en-settings-actions-row compact">
                  <button type="button" :disabled="isLoadingModels" @click="loadAiState">{{ isLoadingModels ? 'Refreshing...' : 'Refresh' }}</button>
                  <button type="button" :disabled="isSavingModelSelection" @click="saveModelSelection">{{ isSavingModelSelection ? 'Saving...' : 'Save routing' }}</button>
                </div>
              </header>

              <div class="en-ai-status-grid">
                <article class="en-ai-status-card" :class="{ ok: localModelRuntime.available }">
                  <Layers class="en-icon" />
                  <div><strong>{{ localModelRuntime.available ? 'Model library ready' : 'Model library unavailable' }}</strong><span>{{ modelRuntimeMessage || 'Installed models are read from the shared model library.' }}</span></div>
                </article>
                <article class="en-ai-status-card" :class="{ ok: selectedChatModel }">
                  <MessageCircle class="en-icon" />
                  <div><strong>{{ selectedChatModel ? 'Chat route set' : 'No chat model' }}</strong><span>{{ selectedChatModelLabel }}</span></div>
                </article>
                <article class="en-ai-status-card" :class="{ ok: selectedEmbeddingModel }">
                  <Search class="en-icon" />
                  <div><strong>{{ selectedEmbeddingModel ? 'Embedding route set' : 'No embedding model' }}</strong><span>{{ selectedEmbeddingModelLabel }}</span></div>
                </article>
              </div>

              <section class="en-settings-section stacked">
                <div>
                  <h3>Feature roles</h3>
                  <p>Choose installed models only. Incompatible models are hidden from each role so a chat GGUF cannot overwrite embeddings or OCR.</p>
                </div>
                <div class="en-ai-role-grid">
                  <article v-for="role in aiRoleRows" :key="role.id" class="en-ai-role-card" :class="{ assigned: role.model }">
                    <header>
                      <span class="en-ai-role-icon"><component :is="role.icon" class="en-icon" /></span>
                      <div><strong>{{ role.title }}</strong><small>{{ role.description }}</small></div>
                    </header>
                    <label>
                      <span>Installed model</span>
                      <select v-model="modelSelection[role.id]" @change="updateRoutingModel(role.id, modelSelection[role.id])">
                        <option value="">{{ role.emptyLabel }}</option>
                        <option v-for="model in role.models" :key="modelRef(model)" :value="modelRef(model)">
                          {{ modelDisplayLabel(model) }}
                        </option>
                      </select>
                    </label>
                    <div class="en-ai-role-footer">
                      <span class="en-ai-status-pill" :class="role.model ? 'ok' : 'pending'">{{ role.model ? 'Assigned' : 'Not assigned' }}</span>
                      <button type="button" :disabled="!modelSelection[role.id]" @click="clearRole(role.id)">Clear</button>
                    </div>
                    <p>{{ role.model ? modelPathLabel(role.model) : role.help }}</p>
                  </article>
                </div>
              </section>

              <section class="en-settings-section stacked">
                <div>
                  <h3>Runtime and tests</h3>
                  <p>Chat tests use the selected Chat role through node-llama-cpp. OCR remains a local Tesseract target.</p>
                </div>
                <div class="en-settings-actions-row">
                  <button type="button" :disabled="isTestingAiConfig || !selectedChatModel" @click="testAiConfig">{{ isTestingAiConfig ? 'Testing...' : 'Test chat route' }}</button>
                  <button type="button" :disabled="isRefreshingModelIndex" @click="refreshModelIndex">{{ isRefreshingModelIndex ? 'Rebuilding...' : 'Rebuild model index' }}</button>
                  <span class="en-settings-message">{{ aiConfigMessage || modelSelectionMessage || modelIndexMessage }}</span>
                </div>
              </section>

              <section class="en-settings-section stacked">
                <div>
                  <h3>OCR test</h3>
                  <p>Use this only to verify the local OCR pipeline; role selection is saved above.</p>
                </div>
                <div class="en-form-grid">
                  <label class="en-full-label"><span>Image path</span><input v-model.trim="ocrImagePath" type="text" placeholder="/path/to/image.png" /></label>
                </div>
                <div class="en-settings-actions-row">
                  <button type="button" :disabled="isRunningOcr || !ocrImagePath" @click="runOcr">{{ isRunningOcr ? 'Extracting...' : 'Extract text' }}</button>
                  <span class="en-settings-message">{{ ocrMessage }}</span>
                </div>
                <pre v-if="ocrText">{{ ocrText }}</pre>
              </section>

              <p v-if="modelDir" class="en-settings-path">Model directory: {{ modelDir }}</p>
            </section>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import log from 'electron-log/renderer'
import { CheckCircle2, Download, GitBranch, Layers, MessageCircle, Moon, RefreshCw, ScanText, Search, Server, SunMedium, Wifi, X } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { createDefaultModelSelection } from 'common/elephantnote/atomicWorkspace'
import { ELEPHANTNOTE_THEME_FAMILIES, getOppositeThemeVariant, getThemeFamily, getThemeLabel, getThemeMode, getThemeTokens, getThemeVariant } from 'common/elephantnote/appearance'
import { clonePlainObject, createNodeLlamaCppTestConfig } from './settingsModelHelpers'
import { formatBytes, getModelCapabilities, getModelFormat, getModelQuantization, resolveModelId, resolveModelName } from '../views/modelsViewHelpers'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const props = defineProps({
  theme: { type: String, required: true },
  sidebarWidth: { type: Number, required: true },
  vaults: { type: Array, default: () => [] },
  activeVaultName: { type: String, default: 'No vault' },
  activeVaultPath: { type: String, default: '' }
})

const emit = defineEmits(['close', 'update-theme', 'update-sidebar-width'])

const sections = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'vaults', label: 'Vaults' },
  { id: 'editor', label: 'Editor' },
  { id: 'import', label: 'Import' },
  { id: 'sites', label: 'Sites' },
  { id: 'sync', label: 'Sync' },
  { id: 'ai', label: 'AI' }
]

const activeSection = ref('appearance')
const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const themeFamilies = ELEPHANTNOTE_THEME_FAMILIES
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const activeThemeFamily = computed(() => getThemeFamily(theme.value))
const activeThemeLabel = computed(() => getThemeLabel(theme.value))
const oppositeTheme = computed(() => getOppositeThemeVariant(theme.value))
const settingsStyle = computed(() => getThemeTokens(theme.value))
const preferences = usePreferencesStore()
const sitePreviewStore = useSitePreviewStore()

const featureFlags = ref({ askAi: true, sitePreview: true, gitSync: false, agents: true, semanticSearch: true })
const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const importMessage = ref('')
const isImporting = ref(false)
const isImportingSource = ref(false)
const isSyncRunning = ref(false)
const syncMessage = ref('')
const syncStatus = ref({ backend: 'git', syncthing: {}, history: [] })
const syncForm = ref({ backend: 'syncthing-git', branch: 'main', peerDeviceId: '', peerAddress: 'dynamic', syncthingEndpoint: 'http://127.0.0.1:8384', syncthingApiKey: '' })

const aiConfig = ref(normalizeAiConfig())
const aiConfigMessage = ref('')
const isTestingAiConfig = ref(false)
const isLoadingModels = ref(false)
const isSavingModelSelection = ref(false)
const isRefreshingModelIndex = ref(false)
const modelSelection = ref(createDefaultModelSelection())
const modelSelectionMessage = ref('')
const modelRuntimeMessage = ref('')
const modelIndexMessage = ref('')
const modelDir = ref('')
const localModels = ref([])
const localModelRuntime = ref({ available: false, dependencyError: '' })
const ocrImagePath = ref('')
const ocrText = ref('')
const ocrMessage = ref('')
const isRunningOcr = ref(false)

const siteStatusLabel = computed(() => {
  if (sitePreviewStore.previewUrl) return 'Preview running'
  if (sitePreviewStore.lastBuild?.outputDir) return 'Static build ready'
  return 'No generated site active'
})

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
    log.warn('Unable to update ElephantNote feature flag:', error)
  }
}

const syncInitPayload = () => ({ ...syncForm.value })
const hydrateSyncForm = (status = {}) => {
  syncStatus.value = { syncthing: {}, history: [], ...status }
  syncForm.value = { ...syncForm.value, backend: status.backend || syncForm.value.backend, branch: status.branch || syncForm.value.branch, peerDeviceId: status.peers?.[0]?.deviceId || syncForm.value.peerDeviceId, peerAddress: status.peers?.[0]?.address || syncForm.value.peerAddress, syncthingEndpoint: status.syncthing?.endpoint || syncForm.value.syncthingEndpoint }
}
const loadSyncStatus = async () => {
  try {
    hydrateSyncForm(await elephantnoteClient.sync.status())
    syncMessage.value = syncStatus.value.lastError || ''
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to load sync status.'
  }
}
const configureSync = async () => {
  if (isSyncRunning.value) return
  isSyncRunning.value = true
  syncMessage.value = 'Configuring synchronization...'
  try {
    hydrateSyncForm(await elephantnoteClient.sync.run({ init: syncInitPayload() }))
    syncMessage.value = syncStatus.value.syncthing?.lastError || 'Synchronization configured.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Synchronization configuration failed.'
  } finally {
    isSyncRunning.value = false
  }
}
const runSync = async () => {
  if (isSyncRunning.value) return
  isSyncRunning.value = true
  syncMessage.value = 'Synchronizing vault...'
  try {
    hydrateSyncForm(await elephantnoteClient.sync.run({ init: syncInitPayload(), snapshot: { message: `ElephantNote manual sync ${new Date().toISOString()}` } }))
    syncMessage.value = syncStatus.value.lastError || syncStatus.value.syncthing?.lastError || 'Synchronization finished.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Synchronization failed.'
  } finally {
    isSyncRunning.value = false
  }
}

const modelRef = (model = {}) => resolveModelId(model)
const modelName = (model = {}) => resolveModelName(model)
const modelSizeLabel = (model = {}) => formatBytes(model.sizeBytes || model.size || model.lfs?.size) || String(model.size || '').trim() || 'unknown size'
const modelDisplayLabel = (model = {}) => `${modelName(model)} · ${getModelFormat(model)}${getModelQuantization(model) ? ` · ${getModelQuantization(model)}` : ''} · ${modelSizeLabel(model)}`
const modelPathLabel = (model = {}) => String(model.path || model.modelPath || model.repoId || modelRef(model) || '')
const modelCaps = (model = {}) => new Set(getModelCapabilities(model).map((cap) => String(cap).toLowerCase()))
const modelSearchText = (model = {}) => [model.id, model.repoId, model.modelId, model.name, model.fileName, model.filename, model.path, model.modelPath, model.pipelineTag, ...(Array.isArray(model.tags) ? model.tags : [])].filter(Boolean).join(' ').toLowerCase()
const isEmbeddingModel = (model = {}) => modelCaps(model).has('embedding') || /embedding|embed|sentence-transformers|all-minilm|bge-|bge_|e5-|gte-|nomic-embed|jina-embeddings/.test(modelSearchText(model))
const isOcrModel = (model = {}) => modelCaps(model).has('ocr') || model.provider === 'local-ocr' || /tesseract|ocr/.test(modelSearchText(model))
const isChatModel = (model = {}) => !isEmbeddingModel(model) && !isOcrModel(model) && (modelCaps(model).has('chat') || getModelFormat(model).toLowerCase() === 'gguf' || /gguf|llama|qwen|gemma|mistral|deepseek|smollm/.test(modelSearchText(model)))
const modelsForRole = (role) => localModels.value.filter((model) => {
  if (!modelRef(model)) return false
  if (role === 'embedding') return isEmbeddingModel(model)
  if (role === 'chat') return isChatModel(model)
  if (role === 'ocr') return isOcrModel(model)
  return false
})
const findSelectedLocalModel = (role) => localModels.value.find((model) => modelRef(model) === modelSelection.value[role]) || null
const selectedEmbeddingModel = computed(() => findSelectedLocalModel('embedding'))
const selectedChatModel = computed(() => findSelectedLocalModel('chat'))
const selectedOcrModel = computed(() => findSelectedLocalModel('ocr'))
const selectedEmbeddingModelLabel = computed(() => selectedEmbeddingModel.value ? modelDisplayLabel(selectedEmbeddingModel.value) : modelSelection.value.embedding || 'Install or select an embedding model.')
const selectedChatModelLabel = computed(() => selectedChatModel.value ? modelDisplayLabel(selectedChatModel.value) : modelSelection.value.chat || 'Install or select a chat model.')
const selectedOcrModelLabel = computed(() => selectedOcrModel.value ? modelDisplayLabel(selectedOcrModel.value) : modelSelection.value.ocr || 'Use local OCR or select an OCR target.')
const aiRoleRows = computed(() => [
  { id: 'embedding', title: 'Embedding', description: 'Semantic search and note graph retrieval.', icon: Search, model: selectedEmbeddingModel.value, models: modelsForRole('embedding'), emptyLabel: 'No embedding model / built-in', help: 'Install an embedding GGUF model from the Model Library.' },
  { id: 'chat', title: 'Chat', description: 'Assistant, RAG chat and agent answers.', icon: MessageCircle, model: selectedChatModel.value, models: modelsForRole('chat'), emptyLabel: 'No chat model', help: 'Install a chat GGUF model from the Model Library.' },
  { id: 'ocr', title: 'OCR', description: 'Text extraction from images and scans.', icon: ScanText, model: selectedOcrModel.value, models: modelsForRole('ocr'), emptyLabel: 'No OCR target', help: 'OCR usually uses the local Tesseract runtime.' }
])

const loadLocalModels = async () => {
  const result = await elephantnoteClient.models.list()
  localModels.value = Array.isArray(result.models) ? result.models : []
  modelDir.value = result.modelDir || result.runtime?.modelDir || ''
  localModelRuntime.value = { available: Boolean(result.available), dependencyError: result.available ? '' : result.message }
  modelIndexMessage.value = result.indexUpdatedAt ? `Index updated ${new Date(result.indexUpdatedAt).toLocaleString()}.` : ''
  modelRuntimeMessage.value = result.message || `${localModels.value.length} installed model${localModels.value.length === 1 ? '' : 's'} discovered.`
}
const loadModelSelection = async () => {
  modelSelection.value = { ...createDefaultModelSelection(), ...(await elephantnoteClient.models.getSelection?.()) }
}
const loadAiConfig = async () => {
  aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.getConfig().catch(() => normalizeAiConfig()))
}
const loadAiState = async () => {
  isLoadingModels.value = true
  try {
    await Promise.all([loadLocalModels(), loadModelSelection(), loadAiConfig()])
  } catch (error) {
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Unable to load AI settings.'
  } finally {
    isLoadingModels.value = false
  }
}
const updateRoutingModel = async (role, value) => {
  modelSelection.value = { ...modelSelection.value, [role]: value || '' }
  await saveModelSelection()
}
const clearRole = async (role) => updateRoutingModel(role, '')
const saveModelSelection = async () => {
  isSavingModelSelection.value = true
  try {
    const payload = clonePlainObject(modelSelection.value)
    modelSelection.value = { ...createDefaultModelSelection(), ...(await elephantnoteClient.models.setSelection(payload)) }
    if (modelSelection.value.chat) await syncAiConfigWithChatModel(modelSelection.value.chat)
    modelSelectionMessage.value = 'AI routing saved.'
  } catch (error) {
    window.localStorage.setItem('elephantnote:atomicModelSelection', JSON.stringify(modelSelection.value))
    modelSelectionMessage.value = error instanceof Error ? `${error.message} Saved locally.` : 'AI routing saved locally.'
  } finally {
    isSavingModelSelection.value = false
  }
}
const syncAiConfigWithChatModel = async (model = modelSelection.value.chat) => {
  const next = normalizeAiConfig({ ...aiConfig.value, preset: 'nodeLlamaCpp', transport: 'node-llama-cpp', endpoint: 'node-llama-cpp://local', model })
  aiConfig.value = next
  await elephantnoteClient.ai.setConfig(clonePlainObject(next))
}
const refreshModelIndex = async () => {
  if (isRefreshingModelIndex.value) return
  isRefreshingModelIndex.value = true
  modelIndexMessage.value = 'Refreshing local model index...'
  try {
    await elephantnoteClient.models.refreshIndex()
    await loadLocalModels()
    modelIndexMessage.value = 'Local model index refreshed.'
  } catch (error) {
    modelIndexMessage.value = error instanceof Error ? error.message : 'Index refresh failed.'
  } finally {
    isRefreshingModelIndex.value = false
  }
}
const testAiConfig = async () => {
  isTestingAiConfig.value = true
  aiConfigMessage.value = 'Testing chat model...'
  try {
    const nextAiConfig = createNodeLlamaCppTestConfig({ aiConfig: aiConfig.value, modelSelection: modelSelection.value, fallbackChatModelId: '' })
    const result = await elephantnoteClient.ai.testConfig(clonePlainObject(nextAiConfig))
    aiConfig.value = normalizeAiConfig(nextAiConfig)
    aiConfigMessage.value = `Chat route OK · ${Math.round(result.latencyMs || 0)} ms · ${result.response || 'response received'}`
  } catch (error) {
    aiConfigMessage.value = error instanceof Error ? error.message : 'AI endpoint test failed.'
  } finally {
    isTestingAiConfig.value = false
  }
}
const runOcr = async () => {
  isRunningOcr.value = true
  ocrMessage.value = 'Running OCR...'
  ocrText.value = ''
  try {
    const result = await elephantnoteClient.ocr.extract(ocrImagePath.value, { language: 'eng' })
    ocrText.value = result.text || ''
    ocrMessage.value = `Extracted ${ocrText.value.length} characters.`
  } catch (error) {
    ocrMessage.value = error instanceof Error ? error.message : 'OCR failed.'
  } finally {
    isRunningOcr.value = false
  }
}

onMounted(async () => {
  try { featureFlags.value = await elephantnoteClient.features.get() } catch {}
  sitePreviewStore.refresh?.()
  loadSyncStatus()
  loadAiState()
})
</script>

<style scoped>
.en-settings-backdrop{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;background:rgba(0,0,0,.46);color:var(--en-text,#f4f4f4)}.en-settings-panel{width:min(1120px,92vw);height:min(820px,88vh);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:22px;background:var(--en-surface,#1f1f1f);box-shadow:0 28px 80px rgba(0,0,0,.35)}.en-settings-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--en-border,rgba(255,255,255,.12))}.en-settings-header p{margin:0;color:var(--en-muted,#9a9a9a);text-transform:uppercase;letter-spacing:.16em;font-size:12px}.en-settings-header h2{margin:2px 0 0;font-size:24px}.en-settings-close,.en-settings-panel button,.en-settings-panel select,.en-settings-panel input{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4)}.en-settings-panel button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:34px;padding:0 14px;cursor:pointer}.en-settings-panel button:disabled{opacity:.5;cursor:not-allowed}.en-settings-panel button.active,.en-settings-toggle-pill.active{border-color:#4caf5c;color:#c9f6d0;background:rgba(76,175,92,.12)}.en-settings-close{width:36px;height:36px;padding:0}.en-settings-grid{display:grid;grid-template-columns:180px minmax(0,1fr);min-height:0}.en-settings-nav{padding:14px;border-right:1px solid var(--en-border,rgba(255,255,255,.12));overflow:auto}.en-settings-nav button{width:100%;justify-content:flex-start;margin-bottom:8px}.en-settings-nav button.active{background:var(--en-accent,#3f7df3);border-color:var(--en-accent,#3f7df3);color:white}.en-settings-content{min-height:0;overflow:auto;padding:18px;display:grid;align-content:start;gap:14px}.en-settings-section,.en-ai-header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:16px;background:var(--en-card,#252525)}.en-settings-section.stacked,.en-ai-shell{display:grid;align-items:start}.en-settings-section h3,.en-ai-header h3{margin:0 0 5px;font-size:18px}.en-settings-section p,.en-ai-header p{margin:0;color:var(--en-muted,#9a9a9a);line-height:1.45}.en-settings-pill,.en-ai-status-pill{display:inline-flex;align-items:center;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:999px;padding:4px 10px;color:var(--en-muted,#9a9a9a)}.en-ai-status-pill.ok{border-color:#4caf5c;color:#c9f6d0}.en-ai-status-pill.pending{border-color:#78683a;color:#f2d690}.en-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.en-form-grid label,.en-ai-role-card label{display:grid;gap:6px;color:var(--en-muted,#9a9a9a)}.en-form-grid input,.en-form-grid select,.en-ai-role-card select{width:100%;min-height:38px;padding:0 12px}.en-full-label{grid-column:1/-1}.en-settings-actions-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.en-settings-actions-row.compact{justify-content:flex-end}.en-settings-message{color:var(--en-muted,#9a9a9a)}.en-settings-path{color:var(--en-muted,#9a9a9a);font-size:12px;overflow-wrap:anywhere}.en-settings-range{display:flex;align-items:center;gap:12px}.en-settings-range input{min-width:180px}.en-theme-switch{min-width:110px}.en-theme-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.en-theme-card{justify-content:flex-start!important;text-align:left}.en-theme-card-preview{display:flex;gap:4px}.en-theme-card-preview i{width:18px;height:18px;border-radius:999px}.en-theme-card-copy{display:grid}.en-theme-card-copy small{color:var(--en-muted,#9a9a9a)}.en-sync-status-grid,.en-ai-status-grid,.en-ai-role-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.en-sync-status-card,.en-ai-status-card,.en-ai-role-card{display:grid;gap:10px;padding:14px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:14px;background:rgba(0,0,0,.12)}.en-sync-status-card.ok,.en-ai-status-card.ok,.en-ai-role-card.assigned{border-color:rgba(76,175,92,.6)}.en-sync-status-card.warn{border-color:rgba(255,193,7,.55)}.en-sync-status-card div,.en-ai-status-card div{display:grid;gap:3px}.en-sync-status-card span,.en-ai-status-card span,.en-ai-role-card small,.en-ai-role-card p{color:var(--en-muted,#9a9a9a)}.en-ai-shell{gap:14px}.en-ai-role-card header{display:flex;gap:10px;align-items:center}.en-ai-role-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.06)}.en-ai-role-footer{display:flex;justify-content:space-between;align-items:center;gap:10px}.en-icon{width:16px;height:16px}pre{max-height:220px;overflow:auto;padding:12px;border-radius:12px;background:rgba(0,0,0,.25);white-space:pre-wrap}@media(max-width:760px){.en-settings-grid{grid-template-columns:1fr}.en-settings-nav{display:flex;gap:8px;border-right:0;border-bottom:1px solid var(--en-border,rgba(255,255,255,.12))}.en-settings-nav button{width:auto;margin:0}.en-settings-section,.en-ai-header{display:grid}.en-form-grid{grid-template-columns:1fr}}
</style>

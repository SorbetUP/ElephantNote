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
            type="button"
            :class="{ active: activeSection === 'appearance' }"
            @click="activeSection = 'appearance'"
          >
            Appearance
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'vaults' }"
            @click="activeSection = 'vaults'"
          >
            Vaults
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'editor' }"
            @click="activeSection = 'editor'"
          >
            Editor
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'search' }"
            @click="activeSection = 'search'"
          >
            Search
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'import' }"
            @click="activeSection = 'import'"
          >
            Import
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'sites' }"
            @click="activeSection = 'sites'"
          >
            Sites
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'sync' }"
            @click="activeSection = 'sync'"
          >
            Sync
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'ai' }"
            @click="activeSection = 'ai'"
          >
            AI
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'models' }"
            @click="activeSection = 'models'"
          >
            Models
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'audio' }"
            @click="activeSection = 'audio'"
          >
            Audio
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'plugins' }"
            @click="activeSection = 'plugins'"
          >
            Plugins
          </button>
          <button
            type="button"
            :class="{ active: activeSection === 'tasks' }"
            @click="activeSection = 'tasks'"
          >
            Tasks
          </button>
        </aside>

        <div class="en-settings-content">
          <section
            v-if="activeSection === 'appearance'"
            class="en-settings-section"
          >
            <div>
              <h3>Theme</h3>
              <p>Switch the entire shell and editor surface between light and dark.</p>
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

          <section
            v-if="activeSection === 'appearance'"
            class="en-settings-section"
          >
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

          <section
            v-if="activeSection === 'appearance'"
            class="en-settings-section"
          >
            <div>
              <h3>Pinned card halo</h3>
              <p>Show a halo around pinned notes and folders.</p>
            </div>
            <button
              class="en-settings-toggle-pill"
              type="button"
              :class="{ active: preferences.pinnedCardHalo }"
              role="switch"
              :aria-checked="preferences.pinnedCardHalo"
              @click="setPinnedCardHalo(!preferences.pinnedCardHalo)"
            >
              {{ preferences.pinnedCardHalo ? 'On' : 'Off' }}
            </button>
          </section>

          <section
            v-if="activeSection === 'vaults'"
            class="en-settings-section"
          >
            <div>
              <h3>Active vault</h3>
              <p>Vault switching stays in the top bar. The current vault path is shown here.</p>
            </div>
            <span class="en-settings-pill">{{ activeVaultName }}</span>
          </section>

          <section
            v-if="activeSection === 'vaults'"
            class="en-settings-section stacked"
          >
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

          <section
            v-if="activeSection === 'editor'"
            class="en-settings-section"
          >
            <div>
              <h3>Editor footer</h3>
              <p>Show the bottom bar with word count, character count, typography controls, and theme shortcut.</p>
            </div>
            <button
              class="en-settings-toggle-pill"
              type="button"
              :class="{ active: preferences.showEditorFooter }"
              role="switch"
              :aria-checked="preferences.showEditorFooter"
              @click="setShowEditorFooter(!preferences.showEditorFooter)"
            >
              {{ preferences.showEditorFooter ? 'Visible' : 'Hidden' }}
            </button>
          </section>

          <section
            v-if="activeSection === 'editor'"
            class="en-settings-section"
          >
            <div>
              <h3>Note editor</h3>
              <p>Notes open in the ElephantNote floating panel. MarkText tabs stay hidden.</p>
            </div>
            <span class="en-settings-pill">Enabled</span>
          </section>

          <section
            v-if="activeSection === 'editor'"
            class="en-settings-section"
          >
            <div>
              <h3>Tag prefix</h3>
              <p>Show or hide the # prefix before tag names in the note editor.</p>
            </div>
            <button
              class="en-settings-toggle-pill"
              type="button"
              :class="{ active: preferences.showTagHashInEditor }"
              role="switch"
              :aria-checked="preferences.showTagHashInEditor"
              @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)"
            >
              {{ preferences.showTagHashInEditor ? 'Show #' : 'Hide #' }}
            </button>
          </section>

          <section
            v-if="activeSection === 'editor'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Autosave</h3>
              <p>Changes are written automatically after a short delay.</p>
            </div>
            <div class="en-settings-range en-settings-range-column">
              <span class="en-settings-pill">On</span>
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
            </div>
          </section>

          <section
            v-if="activeSection === 'editor'"
            class="en-settings-section"
          >
            <div>
              <h3>Quick insert trigger</h3>
              <p>Choose the character that opens the block insertion menu.</p>
            </div>
            <div class="en-trigger-options">
              <button
                ref="quickTriggerButton"
                class="en-trigger-capture"
                type="button"
                :class="{ capturing: isCapturingQuickTrigger }"
                @click="startQuickTriggerCapture"
                @keydown.prevent.stop="captureQuickTrigger"
              >
                <span>{{ preferences.quickInsertTrigger }}</span>
                <small>{{ isCapturingQuickTrigger ? 'Press a key' : 'Click to change' }}</small>
              </button>
            </div>
          </section>

          <search-settings-panel v-if="activeSection === 'search'" />

          <section
            v-if="activeSection === 'import'"
            class="en-settings-section"
          >
            <div>
              <h3>Import notes</h3>
              <p>Bring notes from a Google Keep export into a folder inside the active vault.</p>
            </div>
            <div class="en-import-actions">
              <button
                class="en-import-button"
                type="button"
                :disabled="isImporting"
                @click="importGoogleKeep"
              >
                <Download class="en-icon" />
                {{ isImporting ? 'Importing...' : 'Import Google Keep' }}
              </button>
              <p
                v-if="importMessage"
                class="en-import-message"
              >
                {{ importMessage }}
              </p>
            </div>
          </section>

          <section
            v-if="activeSection === 'import'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Sources</h3>
              <p>Ingest a web page or RSS feed into local markdown notes with source tracking.</p>
            </div>
            <div class="en-source-import-grid">
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
              >
                Import URL
              </button>
              <button
                type="button"
                :disabled="isImportingSource || !sourceUrl"
                @click="importRssSource"
              >
                Import RSS
              </button>
              <span
                v-if="sourceImportMessage"
                class="en-settings-message"
              >
                {{ sourceImportMessage }}
              </span>
            </div>
          </section>

          <section
            v-if="activeSection === 'import'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Google Calendar sync</h3>
              <p>Configure OAuth credentials for bidirectional Google Calendar sync.</p>
            </div>
            <div class="en-source-import-grid">
              <label>
                <span>Client ID</span>
                <input
                  v-model.trim="googleCalendarConfig.clientId"
                  type="text"
                  placeholder="OAuth client id"
                >
              </label>
              <label>
                <span>Calendar ID</span>
                <input
                  v-model.trim="googleCalendarConfig.calendarId"
                  type="text"
                  placeholder="primary"
                >
              </label>
              <label>
                <span>Client secret</span>
                <input
                  v-model.trim="googleCalendarConfig.clientSecret"
                  type="password"
                  placeholder="OAuth client secret"
                >
              </label>
              <label>
                <span>Refresh token</span>
                <input
                  v-model.trim="googleCalendarConfig.refreshToken"
                  type="password"
                  placeholder="OAuth refresh token"
                >
              </label>
            </div>
            <div class="en-settings-actions-row">
              <button
                type="button"
                :class="{ active: googleCalendarConfig.enabled }"
                @click="googleCalendarConfig.enabled = !googleCalendarConfig.enabled"
              >
                {{ googleCalendarConfig.enabled ? 'Enabled' : 'Disabled' }}
              </button>
              <button
                type="button"
                @click="saveGoogleCalendarConfig"
              >
                Save sync config
              </button>
              <button
                type="button"
                @click="syncGoogleCalendar"
              >
                Sync now
              </button>
              <span
                v-if="googleCalendarMessage"
                class="en-settings-message"
              >
                {{ googleCalendarMessage }}
              </span>
            </div>
          </section>

          <section
            v-if="activeSection === 'sites'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Generated sites</h3>
              <p>Manage the current folder website preview without rebuilding it from the library card.</p>
            </div>
            <div class="en-settings-actions-row">
              <button
                type="button"
                :class="{ active: featureFlags.sitePreview }"
                @click="toggleFeature('sitePreview')"
              >
                {{ featureFlags.sitePreview ? 'Enabled' : 'Disabled' }}
              </button>
              <span class="en-settings-pill">{{ siteStatusLabel }}</span>
              <button
                type="button"
                :disabled="!sitePreviewStore.previewUrl"
                @click="sitePreviewStore.openPreviewExternal"
              >
                Open
              </button>
              <button
                type="button"
                :disabled="!sitePreviewStore.info"
                @click="stopSitePreview"
              >
                Disable
              </button>
            </div>
          </section>

          <section
            v-if="activeSection === 'sync'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Git sync</h3>
              <p>Synchronize vault changes through Git without mixing sync controls into AI settings.</p>
            </div>
            <div class="en-settings-actions-row">
              <button
                type="button"
                :class="{ active: featureFlags.gitSync }"
                @click="toggleFeature('gitSync')"
              >
                Git sync {{ featureFlags.gitSync ? 'enabled' : 'disabled' }}
              </button>
            </div>
          </section>

          <section
            v-if="activeSection === 'ai'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>AI and agents</h3>
              <p>Use a local HTTP endpoint such as Ollama, LM Studio, or a Codex-compatible bridge.</p>
            </div>
            <div class="en-settings-actions-row">
              <button
                type="button"
                :class="{ active: featureFlags.ai }"
                @click="toggleFeature('ai')"
              >
                AI {{ featureFlags.ai ? 'enabled' : 'disabled' }}
              </button>
              <button
                type="button"
                :class="{ active: featureFlags.askAi }"
                @click="toggleFeature('askAi')"
              >
                Ask AI {{ featureFlags.askAi ? 'enabled' : 'disabled' }}
              </button>
              <button
                type="button"
                :class="{ active: featureFlags.agents }"
                @click="toggleFeature('agents')"
              >
                Agents {{ featureFlags.agents ? 'enabled' : 'disabled' }}
              </button>
            </div>
          </section>

          <section
            v-if="activeSection === 'ai'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Local endpoint</h3>
              <p>IP and port values are accepted directly, for example 192.168.1.25:11434.</p>
            </div>
            <div class="en-ai-provider-grid">
              <button
                v-for="preset in aiPresets"
                :key="preset.id"
                type="button"
                :class="{ active: aiConfig.preset === preset.id }"
                @click="applyAiPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
            <div class="en-ai-form">
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
              <label class="en-ai-check">
                <input
                  v-model="aiConfig.codexLinkEnabled"
                  type="checkbox"
                >
                <span>Link Codex as an agent when the Codex preset is selected</span>
              </label>
            </div>
            <div class="en-settings-actions-row">
              <button
                type="button"
                :disabled="isSavingAiConfig"
                @click="saveAiConfig"
              >
                {{ isSavingAiConfig ? 'Saving...' : 'Save endpoint' }}
              </button>
              <span
                v-if="aiConfigMessage"
                class="en-settings-message"
              >
                {{ aiConfigMessage }}
              </span>
            </div>
          </section>

          <section
            v-if="activeSection === 'models'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Model slots</h3>
              <p>Choose separate models for embeddings, chat, tagging, wiki generation, speech-to-text, and text-to-speech.</p>
            </div>
            <div class="en-model-grid">
              <label
                v-for="purpose in modelPurposes"
                :key="purpose"
              >
                <span>{{ formatPurpose(purpose) }}</span>
                <select v-model="modelSelection[purpose]">
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
            <div class="en-settings-actions-row">
              <button
                type="button"
                @click="saveModelSelection"
              >
                Save model choices
              </button>
              <button
                type="button"
                @click="downloadSelectedChatModel"
              >
                Download chat model
              </button>
              <button
                type="button"
                @click="loadLocalModels"
              >
                Scan local models
              </button>
              <span
                v-if="modelSelectionMessage || modelRuntimeMessage"
                class="en-settings-message"
              >
                {{ modelRuntimeMessage || modelSelectionMessage }}
              </span>
            </div>
            <p
              v-if="localModels.length"
              class="en-settings-path"
            >
              Local: {{ localModels.map((model) => model.name).join(', ') }}
            </p>
          </section>

          <section
            v-if="activeSection === 'audio'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Voice workflow</h3>
              <p>Audio controls use the same model slots as the future editor microphone and read-aloud toolbar.</p>
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
            v-if="activeSection === 'plugins'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Plugin registry</h3>
              <p>Plugins declare permissions and UI surfaces before they can run inside the vault.</p>
            </div>
            <div class="en-plugin-list">
              <article
                v-for="plugin in pluginManifests"
                :key="plugin.id"
              >
                <header>
                  <strong>{{ plugin.name }}</strong>
                  <button
                    type="button"
                    :class="{ active: plugin.enabled }"
                    @click="togglePlugin(plugin)"
                  >
                    {{ plugin.enabled ? 'Enabled' : 'Disabled' }}
                  </button>
                </header>
                <p>{{ plugin.permissions.join(', ') }}</p>
                <small>{{ plugin.surfaces.join(' · ') }}</small>
              </article>
            </div>
            <span
              v-if="pluginMessage"
              class="en-settings-message"
            >
              {{ pluginMessage }}
            </span>
          </section>

          <section
            v-if="activeSection === 'tasks'"
            class="en-settings-section stacked"
          >
            <div>
              <h3>Programmatic tasks</h3>
              <p>Task manifests define repeatable automations for imports, wiki proposals, scans, and tagging.</p>
            </div>
            <div class="en-task-list">
              <article
                v-for="task in taskTemplates"
                :key="task.id"
              >
                <header>
                  <strong>{{ task.name }}</strong>
                  <div class="en-task-actions">
                    <span>{{ task.cadence }}</span>
                    <button
                      type="button"
                      :class="{ active: task.enabled }"
                      @click="toggleTask(task)"
                    >
                      {{ task.enabled ? 'On' : 'Off' }}
                    </button>
                    <button
                      type="button"
                      @click="runTask(task)"
                    >
                      Run
                    </button>
                  </div>
                </header>
                <p>{{ task.actions.join(' -> ') }}</p>
                <small v-if="task.lastRunAt">
                  Last run {{ task.lastRunAt }} · {{ task.lastResult?.ok ? 'ok' : 'needs attention' }}
                </small>
              </article>
            </div>
            <span
              v-if="taskMessage"
              class="en-settings-message"
            >
              {{ taskMessage }}
            </span>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, Mic, Moon, SunMedium, Volume2, X } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_AI_PRESETS, normalizeAiConfig } from 'common/elephantnote/aiProviders'
import {
  ATOMIC_MODEL_CATALOG,
  ATOMIC_PLUGIN_MANIFESTS,
  MODEL_PURPOSES,
  PROGRAMMATIC_TASK_TEMPLATES,
  createDefaultModelSelection,
  getModelsByPurpose
} from 'common/elephantnote/atomicWorkspace'
import SearchSettingsPanel from '../../search/SearchSettingsPanel.vue'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const props = defineProps({
  theme: {
    type: String,
    required: true
  },
  sidebarWidth: {
    type: Number,
    required: true
  },
  vaults: {
    type: Array,
    default: () => []
  },
  activeVaultName: {
    type: String,
    default: 'No vault'
  }
})

defineEmits(['close', 'update-theme', 'update-sidebar-width'])

const activeSection = ref('appearance')
const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const isImporting = ref(false)
const importMessage = ref('')
const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const isImportingSource = ref(false)
const googleCalendarConfig = ref({
  enabled: false,
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  accessToken: '',
  calendarId: 'primary'
})
const googleCalendarMessage = ref('')
const aiConfigMessage = ref('')
const isSavingAiConfig = ref(false)
const isCapturingQuickTrigger = ref(false)
const quickTriggerButton = ref(null)
const preferences = usePreferencesStore()
const sitePreviewStore = useSitePreviewStore()
const aiPresets = Object.values(ELEPHANTNOTE_AI_PRESETS)
const aiConfig = ref(normalizeAiConfig())
const modelPurposes = MODEL_PURPOSES
const modelCatalog = ATOMIC_MODEL_CATALOG
const pluginManifests = ref(ATOMIC_PLUGIN_MANIFESTS)
const taskTemplates = ref(PROGRAMMATIC_TASK_TEMPLATES)
const modelSelection = ref(createDefaultModelSelection())
const modelSelectionMessage = ref('')
const modelRuntimeMessage = ref('')
const localModels = ref([])
const pluginMessage = ref('')
const taskMessage = ref('')
const featureFlags = ref({
  ai: true,
  askAi: true,
  sitePreview: true,
  gitSync: false,
  agents: true,
  semanticSearch: true
})
const siteStatusLabel = computed(() => {
  if (sitePreviewStore.previewUrl) return 'Preview running'
  if (sitePreviewStore.lastBuild?.outputDir) return 'Static build ready'
  return 'No generated site active'
})

const setAutoSaveDelay = (value) => {
  preferences.SET_SINGLE_PREFERENCE({
    type: 'autoSaveDelay',
    value
  })
}

const setPinnedCardHalo = (value) => {
  preferences.SET_SINGLE_PREFERENCE({
    type: 'pinnedCardHalo',
    value
  })
}

const setShowTagHashInEditor = (value) => {
  preferences.SET_SINGLE_PREFERENCE({
    type: 'showTagHashInEditor',
    value
  })
}

const setShowEditorFooter = (value) => {
  preferences.SET_SINGLE_PREFERENCE({
    type: 'showEditorFooter',
    value
  })
}

const setQuickInsertTrigger = (value) => {
  if (!value || value.length !== 1 || /\s/.test(value)) return
  preferences.SET_SINGLE_PREFERENCE({
    type: 'quickInsertTrigger',
    value
  })
}

const stopQuickTriggerCapture = () => {
  isCapturingQuickTrigger.value = false
}

const startQuickTriggerCapture = async () => {
  isCapturingQuickTrigger.value = true
  await nextTick()
  quickTriggerButton.value?.focus?.()
}

const captureQuickTrigger = (event) => {
  if (!isCapturingQuickTrigger.value) return
  if (event.key === 'Escape') {
    stopQuickTriggerCapture()
    return
  }
  if (event.key && event.key.length === 1 && !/\s/.test(event.key)) {
    setQuickInsertTrigger(event.key)
    stopQuickTriggerCapture()
  }
}

const settingsStyle = computed(() => {
  if (theme.value === 'dark') {
    return {
      '--en-bg': '#0f141d',
      '--en-surface': '#141a24',
      '--en-sidebar-bg': '#101722',
      '--en-soft': '#1b2432',
      '--en-soft-strong': '#202b3b',
      '--en-border': '#283244',
      '--en-border-strong': '#3a465a',
      '--en-text': '#eef3fb',
      '--en-muted': '#98a3b6',
      '--en-subtle': '#7f8aa0',
      '--en-primary': '#5ea1ff',
      '--en-card-shadow': '0 18px 44px rgba(0, 0, 0, 0.28)'
    }
  }

  return {
    '--en-bg': '#f7f9fc',
    '--en-surface': '#ffffff',
    '--en-sidebar-bg': '#edf2f7',
    '--en-soft': '#e9eff7',
    '--en-soft-strong': '#dfe7f1',
    '--en-border': '#c5cfdd',
    '--en-border-strong': '#aebacd',
    '--en-text': '#101828',
    '--en-muted': '#475467',
    '--en-subtle': '#667085',
    '--en-primary': '#2563eb',
    '--en-card-shadow': '0 30px 90px rgba(15, 23, 42, 0.22)'
  }
})

const importGoogleKeep = async () => {
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await elephantnoteClient.imports.googleKeep()
    if (result?.canceled) {
      return
    }
    importMessage.value = `Imported ${result.imported} note${result.imported === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped}` : ''}.`
  } catch (error) {
    importMessage.value = error instanceof Error ? error.message : 'Import failed.'
  } finally {
    isImporting.value = false
  }
}

const ingestSourceUrl = async () => {
  isImportingSource.value = true
  sourceImportMessage.value = ''
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
  sourceImportMessage.value = ''
  try {
    const result = await elephantnoteClient.sources.importRss(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const loadGoogleCalendarConfig = async () => {
  try {
    googleCalendarConfig.value = await elephantnoteClient.calendar.getGoogleConfig()
  } catch (error) {
    console.warn('Unable to load Google Calendar config:', error)
  }
}

const saveGoogleCalendarConfig = async () => {
  try {
    googleCalendarConfig.value = await elephantnoteClient.calendar.setGoogleConfig(googleCalendarConfig.value)
    googleCalendarMessage.value = 'Google Calendar sync config saved.'
  } catch (error) {
    googleCalendarMessage.value = error instanceof Error ? error.message : 'Google Calendar config save failed.'
  }
}

const syncGoogleCalendar = async () => {
  googleCalendarMessage.value = 'Syncing...'
  try {
    const result = await elephantnoteClient.calendar.syncGoogle()
    googleCalendarMessage.value = `Pulled ${result.pulled || 0}, pushed ${result.pushed || 0}.`
  } catch (error) {
    googleCalendarMessage.value = error instanceof Error ? error.message : 'Google Calendar sync failed.'
  }
}

const stopSitePreview = async () => {
  await sitePreviewStore.stopPreview()
  sitePreviewStore.clear()
}

const loadFeatureFlags = async () => {
  try {
    featureFlags.value = await elephantnoteClient.features.get()
  } catch (error) {
    console.warn('Unable to load ElephantNote feature flags:', error)
  }
}

const loadAiConfig = async () => {
  try {
    aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.getConfig())
  } catch (error) {
    console.warn('Unable to load ElephantNote AI config:', error)
  }
}

const applyAiPreset = (preset) => {
  aiConfig.value = normalizeAiConfig({
    ...aiConfig.value,
    ...preset,
    preset: preset.id,
    name: preset.label,
    apiKey: aiConfig.value.apiKey
  })
  aiConfigMessage.value = ''
}

const formatPurpose = (purpose) => purpose
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

const getModelsForPurpose = (purpose) => getModelsByPurpose(purpose, modelCatalog)

const selectedModelName = (purpose) => {
  const model = modelCatalog.find((item) => item.id === modelSelection.value[purpose])
  return model?.name || 'Not selected'
}

const saveModelSelection = () => {
  elephantnoteClient.models.setSelection(modelSelection.value)
    .then((selection) => {
      modelSelection.value = {
        ...createDefaultModelSelection(),
        ...selection
      }
      modelSelectionMessage.value = 'Model choices saved.'
    })
    .catch((error) => {
      window.localStorage.setItem('elephantnote:atomicModelSelection', JSON.stringify(modelSelection.value))
      modelSelectionMessage.value = error instanceof Error
        ? `${error.message} Saved locally.`
        : 'Model choices saved locally.'
    })
}

const loadPlugins = async () => {
  try {
    pluginManifests.value = await elephantnoteClient.plugins.list()
  } catch (error) {
    console.warn('Unable to load ElephantNote plugins:', error)
  }
}

const togglePlugin = async (plugin) => {
  pluginMessage.value = ''
  try {
    pluginManifests.value = await elephantnoteClient.plugins.set({
      id: plugin.id,
      enabled: !plugin.enabled,
      config: plugin.config || {}
    })
    pluginMessage.value = `${plugin.name} ${plugin.enabled ? 'disabled' : 'enabled'}.`
  } catch (error) {
    pluginMessage.value = error instanceof Error ? error.message : 'Plugin update failed.'
  }
}

const loadTasks = async () => {
  try {
    taskTemplates.value = await elephantnoteClient.tasks.list()
  } catch (error) {
    console.warn('Unable to load ElephantNote tasks:', error)
  }
}

const toggleTask = async (task) => {
  taskMessage.value = ''
  try {
    taskTemplates.value = await elephantnoteClient.tasks.set({
      id: task.id,
      enabled: !task.enabled
    })
    taskMessage.value = `${task.name} ${task.enabled ? 'disabled' : 'enabled'}.`
  } catch (error) {
    taskMessage.value = error instanceof Error ? error.message : 'Task update failed.'
  }
}

const runTask = async (task) => {
  taskMessage.value = ''
  try {
    taskTemplates.value = await elephantnoteClient.tasks.run(task.id)
    taskMessage.value = `${task.name} finished.`
  } catch (error) {
    taskMessage.value = error instanceof Error ? error.message : 'Task run failed.'
  }
}

const loadModelSelection = async () => {
  try {
    modelSelection.value = {
      ...createDefaultModelSelection(),
      ...(await elephantnoteClient.models.getSelection())
    }
    return
  } catch {
    // Fall back to local storage for legacy preload contexts.
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem('elephantnote:atomicModelSelection') || '{}')
    modelSelection.value = {
      ...createDefaultModelSelection(),
      ...stored
    }
  } catch {
    modelSelection.value = createDefaultModelSelection()
  }
}

const loadLocalModels = async () => {
  try {
    const result = await elephantnoteClient.models.listLocal()
    localModels.value = result.models || []
    modelRuntimeMessage.value = result.available
      ? `${localModels.value.length} local model${localModels.value.length === 1 ? '' : 's'} found.`
      : result.error || 'Local model runtime not available.'
  } catch (error) {
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Unable to scan local models.'
  }
}

const downloadSelectedChatModel = async () => {
  modelRuntimeMessage.value = 'Downloading model...'
  try {
    const result = await elephantnoteClient.models.download(modelSelection.value.chat)
    modelRuntimeMessage.value = result.message || 'Model download finished.'
    await loadLocalModels()
  } catch (error) {
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Model download failed.'
  }
}

const saveAiConfig = async () => {
  isSavingAiConfig.value = true
  aiConfigMessage.value = ''
  try {
    aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.setConfig(aiConfig.value))
    aiConfigMessage.value = aiConfig.value.preset === 'codex'
      ? 'Saved and Codex agent link updated.'
      : 'Endpoint saved.'
  } catch (error) {
    aiConfigMessage.value = error instanceof Error ? error.message : 'AI endpoint save failed.'
  } finally {
    isSavingAiConfig.value = false
  }
}

const toggleFeature = async (key) => {
  try {
    featureFlags.value = await elephantnoteClient.features.set(key, !featureFlags.value[key])
    window.dispatchEvent(new CustomEvent('elephantnote:feature-flags-changed', {
      detail: featureFlags.value
    }))
  } catch (error) {
    console.warn('Unable to update ElephantNote feature flag:', error)
  }
}

onMounted(() => {
  loadFeatureFlags()
  loadAiConfig()
  loadModelSelection()
  loadPlugins()
  loadTasks()
  loadGoogleCalendarConfig()
})

onBeforeUnmount(stopQuickTriggerCapture)
</script>

<style scoped>
.en-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 12, 18, 0.34);
}

.en-settings-panel {
  width: min(960px, calc(100vw - 48px));
  max-height: min(780px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-surface);
  box-shadow: var(--en-card-shadow);
  overflow: hidden;
}

.en-settings-header {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--en-border);
  background: color-mix(in srgb, var(--en-surface) 92%, var(--en-bg));
}

.en-settings-header p,
.en-settings-header h2 {
  margin: 0;
}

.en-settings-header p {
  color: var(--en-muted);
  font-size: 13px;
  font-weight: 700;
}

.en-settings-header h2 {
  margin-top: 4px;
  color: var(--en-text);
  font-size: 26px;
  line-height: 1.1;
}

.en-settings-close {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
}

.en-settings-close:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-settings-grid {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
}

.en-settings-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-right: 1px solid var(--en-border);
  background: var(--en-sidebar-bg);
  overflow: auto;
}

.en-settings-nav button {
  width: 100%;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.en-settings-nav button:hover,
.en-settings-nav button.active {
  border-color: color-mix(in srgb, var(--en-border-strong) 66%, transparent);
  color: var(--en-text);
  background: var(--en-soft);
}

.en-settings-content {
  min-height: 0;
  padding: 4px 24px 24px;
  overflow: auto;
}

.en-settings-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 0;
  border-bottom: 1px solid var(--en-border);
}

.en-settings-section.stacked {
  display: grid;
  gap: 14px;
}

.en-settings-section h3 {
  margin: 0 0 6px;
  color: var(--en-text);
  font-size: 17px;
  line-height: 1.2;
}

.en-settings-section p {
  margin: 0;
  color: var(--en-muted);
  font-size: 14px;
  line-height: 1.45;
}

.en-settings-path {
  overflow-wrap: anywhere;
}

.en-settings-pill,
.en-settings-toggle-pill,
.en-theme-switch,
.en-import-button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.en-settings-pill {
  max-width: 340px;
  color: var(--en-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-settings-toggle-pill,
.en-theme-switch,
.en-import-button {
  cursor: pointer;
}

.en-settings-toggle-pill.active,
.en-theme-switch.dark {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-theme-icon,
.en-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.en-theme-switch .light {
  color: #f59e0b;
}

.en-theme-switch .dark {
  color: #60a5fa;
}

.en-settings-range {
  min-width: 220px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--en-muted);
  font: inherit;
  font-weight: 700;
}

.en-settings-range input[type="range"] {
  width: 180px;
  accent-color: var(--en-primary);
}

.en-settings-range output {
  min-width: 56px;
  color: var(--en-text);
}

.en-settings-range-column {
  display: grid;
  justify-items: end;
}

.en-import-actions {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.en-import-button:disabled {
  cursor: progress;
  opacity: 0.62;
}

.en-import-message {
  max-width: 280px;
  text-align: right;
}

.en-settings-actions-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.en-settings-actions-row button {
  height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
}

.en-settings-actions-row button:disabled {
  opacity: 0.5;
}

.en-settings-actions-row button.active {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-settings-message {
  color: var(--en-muted);
  font-size: 13px;
  font-weight: 700;
}

.en-ai-provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 8px;
}

.en-ai-provider-grid button {
  min-height: 36px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.en-ai-provider-grid button.active {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-ai-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.en-source-import-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 12px;
}

.en-source-import-grid label {
  display: grid;
  gap: 6px;
}

.en-source-import-grid span {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 800;
}

.en-source-import-grid input {
  min-width: 0;
  height: 36px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
}

.en-model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.en-model-grid label {
  display: grid;
  gap: 6px;
}

.en-model-grid span {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 800;
}

.en-model-grid select {
  min-width: 0;
  height: 36px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
}

.en-audio-grid,
.en-plugin-list,
.en-task-list {
  display: grid;
  gap: 10px;
}

.en-audio-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.en-audio-grid article,
.en-plugin-list article,
.en-task-list article {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--en-surface);
}

.en-audio-grid article {
  display: grid;
  gap: 8px;
}

.en-audio-grid strong,
.en-plugin-list strong,
.en-task-list strong {
  color: var(--en-text);
}

.en-audio-grid span,
.en-plugin-list p,
.en-plugin-list small,
.en-task-list p,
.en-plugin-list span,
.en-task-list span {
  color: var(--en-muted);
}

.en-plugin-list header,
.en-task-list header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.en-plugin-list header button {
  min-height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: var(--en-surface);
  font: inherit;
  font-size: 13px;
}

.en-plugin-list header button.active {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-plugin-list p,
.en-task-list p {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}

.en-task-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.en-task-actions button {
  min-height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: var(--en-surface);
  font: inherit;
  font-size: 13px;
}

.en-task-actions button.active {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-ai-form label {
  display: grid;
  gap: 6px;
}

.en-ai-form span {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 800;
}

.en-ai-form input,
.en-ai-form select {
  min-width: 0;
  height: 36px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
}

.en-ai-check {
  grid-column: 1 / -1;
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
}

.en-ai-check input {
  width: 16px;
  height: 16px;
}

.en-trigger-options {
  display: inline-flex;
  padding: 0;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background: var(--en-soft);
}

.en-trigger-capture {
  min-width: 168px;
  height: 46px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.en-trigger-capture span {
  width: 36px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--en-border);
  border-radius: 7px;
  background: var(--en-soft-strong);
  font: 800 20px/1 var(--en-code-font, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.en-trigger-capture small {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 800;
  text-align: left;
}

.en-trigger-capture:hover,
.en-trigger-capture.capturing {
  border-color: var(--en-border-strong);
  background: var(--en-soft-strong);
}

@media (max-width: 720px) {
  .en-settings-backdrop {
    padding: 12px;
  }

  .en-settings-panel {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .en-settings-grid {
    grid-template-columns: 1fr;
  }

  .en-settings-nav {
    flex-direction: row;
    border-right: 0;
    border-bottom: 1px solid var(--en-border);
  }

  .en-settings-nav button {
    width: auto;
    flex: 0 0 auto;
  }

  .en-settings-section {
    align-items: flex-start;
    flex-direction: column;
  }

  .en-settings-range {
    min-width: 0;
    width: 100%;
  }

  .en-settings-range input[type="range"] {
    width: 100%;
  }

  .en-ai-form {
    grid-template-columns: 1fr;
  }

  .en-model-grid,
  .en-audio-grid,
  .en-source-import-grid {
    grid-template-columns: 1fr;
  }
}
</style>

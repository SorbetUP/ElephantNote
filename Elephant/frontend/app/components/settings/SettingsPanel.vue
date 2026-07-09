<template>
  <div
    class="en-settings-backdrop"
    :class="[`en-theme-${themeMode}`, `en-theme-${themeClassId}`]"
    :style="settingsStyle"
    @click.self="emit('close')"
  >
    <section
      class="en-settings-panel"
      :class="{ 'is-macos': isMacOS }"
      :style="settingsStyle"
      role="dialog"
      aria-modal="true"
      aria-label="ElephantNote settings"
    >
      <header class="en-settings-header">
        <button class="en-icon-button en-settings-close" type="button" aria-label="Close settings" @click="emit('close')">
          <X aria-hidden="true" />
        </button>
        <h2>Settings</h2>
        <label class="en-settings-search">
          <Search aria-hidden="true" />
          <input ref="searchInput" v-model="settingsQuery" type="search" placeholder="Search all settings" aria-label="Search all settings">
          <kbd v-if="!settingsQuery">{{ isMacOS ? '⌘' : 'Ctrl' }} F</kbd>
        </label>
      </header>

      <div class="en-settings-grid">
        <aside class="en-settings-nav" aria-label="Settings sections">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            :class="{ active: !settingsQuery && activeSection === item.id }"
            @click="selectSection(item.id)"
          >
            <component :is="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
            <ChevronRight class="en-settings-nav-chevron" aria-hidden="true" />
          </button>
          <footer class="en-settings-nav-footer">
            <span>Local-first</span>
            <span>v0.18.9</span>
          </footer>
        </aside>

        <main ref="settingsContent" class="en-settings-content">
          <template v-if="settingsQuery.trim()">
            <div class="en-settings-page-title">
              <h1>Search</h1>
              <span>{{ searchResults.length }} result{{ searchResults.length === 1 ? '' : 's' }}</span>
            </div>
            <section v-if="searchResults.length" class="en-settings-search-results">
              <button v-for="result in searchResults" :key="result.id" type="button" @click="openSearchResult(result)">
                <span class="en-settings-result-icon"><component :is="result.icon" aria-hidden="true" /></span>
                <span class="en-settings-result-copy">
                  <strong>{{ result.label }}</strong>
                  <small>{{ result.description }}</small>
                </span>
                <span class="en-settings-result-section">{{ result.sectionLabel }}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            </section>
            <div v-else class="en-settings-empty-state en-settings-search-empty">
              <Search aria-hidden="true" />
              <strong>No setting found</strong>
              <span>Try another word, feature name or control.</span>
            </div>
          </template>

          <template v-else>
            <div class="en-settings-page-title"><h1>{{ activeSectionMeta.label }}</h1></div>

            <template v-if="activeSection === 'appearance'">
              <section class="en-settings-group">
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Color mode</strong><span>Use the light or dark variant of the selected theme.</span></div>
                  <div class="en-segmented" aria-label="Color mode">
                    <button type="button" :class="{ active: themeMode === 'light' }" @click="emit('update-theme', getThemeVariant(activeThemeFamily.id, 'light'))"><SunMedium aria-hidden="true" /> Light</button>
                    <button type="button" :class="{ active: themeMode === 'dark' }" @click="emit('update-theme', getThemeVariant(activeThemeFamily.id, 'dark'))"><Moon aria-hidden="true" /> Dark</button>
                  </div>
                </div>

                <div class="en-settings-row en-settings-row-stacked">
                  <div class="en-settings-row-copy"><strong>Theme</strong><span>Choose the visual family used throughout ElephantNote.</span></div>
                  <div class="en-theme-grid">
                    <button
                      v-for="family in themeFamilies"
                      :key="family.id"
                      type="button"
                      class="en-theme-card"
                      :class="{ active: activeThemeFamily.id === family.id }"
                      @click="emit('update-theme', getThemeVariant(family.id, themeMode))"
                    >
                      <span class="en-theme-card-preview" :style="{ background: family.swatches[0] }">
                        <i class="sidebar" :style="{ background: family.swatches[1] }" />
                        <i class="canvas" :style="{ background: family.swatches[2] }">
                          <b :style="{ background: family.swatches[3] || family.swatches[2] }" />
                          <b :style="{ background: family.swatches[3] || family.swatches[2] }" />
                        </i>
                      </span>
                      <span class="en-theme-card-copy"><strong>{{ family.name }}</strong><small>{{ family.description }}</small></span>
                      <span v-if="activeThemeFamily.id === family.id" class="en-theme-card-check"><Check aria-hidden="true" /></span>
                    </button>
                  </div>
                </div>

                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Sidebar width</strong><span>Resize the main navigation rail.</span></div>
                  <label class="en-range-control">
                    <input type="range" min="184" max="320" :value="sidebarWidth" @input="emit('update-sidebar-width', Number($event.target.value))">
                    <output>{{ sidebarWidth }} px</output>
                  </label>
                </div>
              </section>
            </template>

            <template v-else-if="activeSection === 'editor'">
              <section class="en-settings-group">
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Editor footer</strong><span>Show word count, typography controls and the theme shortcut.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Show editor footer" :aria-checked="preferences.showEditorFooter" :class="{ active: preferences.showEditorFooter }" @click="setPreference('showEditorFooter', !preferences.showEditorFooter)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Tag prefix</strong><span>Display # before tag names in the editor.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Show tag prefix" :aria-checked="preferences.showTagHashInEditor" :class="{ active: preferences.showTagHashInEditor }" @click="setPreference('showTagHashInEditor', !preferences.showTagHashInEditor)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Quick insert menu</strong><span>Show the block command menu when its trigger is typed.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Show quick insert menu" :aria-checked="!preferences.hideQuickInsertHint" :class="{ active: !preferences.hideQuickInsertHint }" @click="setPreference('hideQuickInsertHint', !preferences.hideQuickInsertHint)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Quick insert trigger</strong><span>The character that opens the insert menu. The default is /.</span></div>
                  <input class="en-compact-input en-trigger-input" :value="preferences.quickInsertTrigger" maxlength="1" aria-label="Quick insert trigger" @change="setQuickInsertTrigger($event.target.value)">
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Pair brackets</strong><span>Automatically insert the matching closing bracket.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Automatically pair brackets" :aria-checked="preferences.autoPairBracket" :class="{ active: preferences.autoPairBracket }" @click="setPreference('autoPairBracket', !preferences.autoPairBracket)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Pair Markdown syntax</strong><span>Automatically close Markdown emphasis and formatting markers.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Automatically pair Markdown syntax" :aria-checked="preferences.autoPairMarkdownSyntax" :class="{ active: preferences.autoPairMarkdownSyntax }" @click="setPreference('autoPairMarkdownSyntax', !preferences.autoPairMarkdownSyntax)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Pair quotes</strong><span>Automatically insert the matching closing quote.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Automatically pair quotes" :aria-checked="preferences.autoPairQuote" :class="{ active: preferences.autoPairQuote }" @click="setPreference('autoPairQuote', !preferences.autoPairQuote)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Spellchecker</strong><span>Check spelling while writing.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Enable spellchecker" :aria-checked="preferences.spellcheckerEnabled" :class="{ active: preferences.spellcheckerEnabled }" @click="setPreference('spellcheckerEnabled', !preferences.spellcheckerEnabled)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Code block line numbers</strong><span>Display line numbers in fenced code blocks.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Show code block line numbers" :aria-checked="preferences.codeBlockLineNumbers" :class="{ active: preferences.codeBlockLineNumbers }" @click="setPreference('codeBlockLineNumbers', !preferences.codeBlockLineNumbers)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Note margins</strong><span>Horizontal space around the title and text.</span></div>
                  <label class="en-range-control">
                    <input type="range" min="8" max="160" step="4" :value="preferences.noteEditorMargin" @input="setNoteEditorMargin(Number($event.target.value))">
                    <output>{{ preferences.noteEditorMargin }} px</output>
                  </label>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Autosave</strong><span>Write changes to disk automatically.</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Enable autosave" :aria-checked="preferences.autoSave" :class="{ active: preferences.autoSave }" @click="setPreference('autoSave', !preferences.autoSave)"><span /></button>
                </div>
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Autosave delay</strong><span>How long ElephantNote waits after the last edit.</span></div>
                  <select class="en-compact-select" :disabled="!preferences.autoSave" :value="preferences.autoSaveDelay" @change="setPreference('autoSaveDelay', Number($event.target.value))">
                    <option :value="250">Instant · 250 ms</option>
                    <option :value="500">Fast · 500 ms</option>
                    <option :value="1000">Balanced · 1 s</option>
                    <option :value="2000">Relaxed · 2 s</option>
                    <option :value="5000">Battery saver · 5 s</option>
                  </select>
                </div>
              </section>
            </template>

            <template v-else-if="activeSection === 'vaults'">
              <section class="en-settings-group">
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>
                  <span class="en-status-badge active"><HardDrive aria-hidden="true" />{{ activeVaultName }}</span>
                </div>
                <div v-if="vaults.length" class="en-vault-list">
                  <article v-for="vault in vaults" :key="vault.id" class="en-vault-row">
                    <span class="en-vault-icon"><FolderOpen aria-hidden="true" /></span>
                    <div><strong>{{ vault.name }}</strong><p>{{ vault.path }}</p></div>
                    <button type="button" class="en-danger-button" :disabled="removingVaultId === vault.id" @click="removeVaultFromApp(vault)">{{ removingVaultId === vault.id ? 'Removing…' : 'Remove' }}</button>
                  </article>
                </div>
                <div v-else class="en-settings-empty-state"><FolderOpen aria-hidden="true" /><strong>No vault registered</strong><span>Open a folder from the main workspace to add it.</span></div>
                <p v-if="vaultMessage" class="en-settings-feedback">{{ vaultMessage }}</p>
              </section>
            </template>

            <template v-else-if="activeSection === 'addons'">
              <addons-settings-panel />
            </template>

            <template v-else-if="activeSection === 'sync'">
              <sync-settings-panel :vaults="vaults" :active-vault-path="activeVaultPath" :initial-page="syncInitialPage" />
            </template>

            <template v-else-if="activeSection === 'ai'">
              <ai-provider-settings-panel :initial-page="aiInitialPage" />
            </template>

            <template v-else-if="activeSection === 'sites'">
              <section class="en-settings-group">
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Site preview</strong><span>{{ siteStatusLabel }}</span></div>
                  <button class="en-switch" type="button" role="switch" aria-label="Enable site preview" :aria-checked="featureFlags.sitePreview" :class="{ active: featureFlags.sitePreview }" @click="toggleFeature('sitePreview')"><span /></button>
                </div>
                <div class="en-settings-inline-actions">
                  <button type="button" :disabled="!sitePreviewStore.previewUrl" @click="sitePreviewStore.openPreviewExternal"><Globe2 aria-hidden="true" />Open preview</button>
                  <button type="button" :disabled="!sitePreviewStore.info" @click="stopSitePreview">Stop preview</button>
                </div>
              </section>
            </template>

            <template v-else-if="activeSection === 'import'">
              <section class="en-settings-group">
                <div class="en-settings-row">
                  <div class="en-settings-row-copy"><strong>Google Keep archive</strong><span>Convert an exported archive into local Markdown notes.</span></div>
                  <button class="en-primary-button" type="button" :disabled="isImporting" @click="importGoogleKeep"><Download aria-hidden="true" />{{ isImporting ? 'Importing…' : 'Import Google Keep' }}</button>
                </div>
                <div class="en-form-grid">
                  <label><span>Source URL</span><input v-model.trim="sourceUrl" type="url" placeholder="https://example.com/article"></label>
                  <label><span>Destination folder</span><input v-model.trim="sourceDestination" type="text" placeholder="Sources"></label>
                </div>
                <div class="en-settings-inline-actions">
                  <button type="button" :disabled="isImportingSource || !sourceUrl" @click="ingestSourceUrl">Import page</button>
                  <button type="button" :disabled="isImportingSource || !sourceUrl" @click="importRssSource">Import RSS</button>
                  <span>{{ sourceImportMessage || importMessage }}</span>
                </div>
              </section>
            </template>
          </template>
        </main>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import log from '@/platform/runtimeLogShim'
import {
  Check,
  ChevronRight,
  Cloud,
  Download,
  FolderOpen,
  Globe2,
  HardDrive,
  Moon,
  Package,
  Palette,
  PenLine,
  Search,
  Sparkles,
  SunMedium,
  X
} from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_THEME_FAMILIES, getThemeFamily, getThemeLabel, getThemeMode, getThemeTokens, getThemeVariant } from 'common/elephantnote/appearance'
import AddonsSettingsPanel from './AddonsSettingsPanel.vue'
import AiProviderSettingsPanel from './AiProviderSettingsPanel.vue'
import SyncSettingsPanel from './SyncSettingsPanel.vue'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { useVaultStore } from '../../stores/vaultStore'

const props = defineProps({
  theme: { type: String, required: true },
  sidebarWidth: { type: Number, required: true },
  vaults: { type: Array, default: () => [] },
  activeVaultName: { type: String, default: 'No vault' },
  activeVaultPath: { type: String, default: '' }
})
const emit = defineEmits(['close', 'update-theme', 'update-sidebar-width'])

const sections = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: PenLine },
  { id: 'vaults', label: 'Vaults', icon: FolderOpen },
  { id: 'addons', label: 'Addons', icon: Package },
  { id: 'sync', label: 'Sync', icon: Cloud },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'sites', label: 'Sites', icon: Globe2 },
  { id: 'import', label: 'Import', icon: Download }
]
const sectionById = Object.fromEntries(sections.map((section) => [section.id, section]))
const settingsIndex = [
  { id: 'appearance-mode', section: 'appearance', label: 'Color mode', description: 'Light and dark appearance.' },
  { id: 'appearance-theme', section: 'appearance', label: 'Theme', description: 'Elephant, Apple, Graphite, Nord, Solar and Forest themes.' },
  { id: 'appearance-sidebar', section: 'appearance', label: 'Sidebar width', description: 'Resize the main navigation rail.' },
  { id: 'editor-footer', section: 'editor', label: 'Editor footer', description: 'Word count and typography controls.' },
  { id: 'editor-tags', section: 'editor', label: 'Tag prefix', description: 'Show or hide the # before tags.' },
  { id: 'editor-quick-insert', section: 'editor', label: 'Quick insert menu', description: 'Show block commands when typing the trigger.' },
  { id: 'editor-quick-trigger', section: 'editor', label: 'Quick insert trigger', description: 'Change the / command trigger.' },
  { id: 'editor-brackets', section: 'editor', label: 'Pair brackets', description: 'Automatically close brackets.' },
  { id: 'editor-markdown', section: 'editor', label: 'Pair Markdown syntax', description: 'Automatically close Markdown markers.' },
  { id: 'editor-quotes', section: 'editor', label: 'Pair quotes', description: 'Automatically close quotation marks.' },
  { id: 'editor-spellchecker', section: 'editor', label: 'Spellchecker', description: 'Check spelling while writing.' },
  { id: 'editor-code-lines', section: 'editor', label: 'Code block line numbers', description: 'Show line numbers in fenced code blocks.' },
  { id: 'editor-margin', section: 'editor', label: 'Note margins', description: 'Horizontal writing space.' },
  { id: 'editor-autosave', section: 'editor', label: 'Autosave', description: 'Automatically persist changes to disk.' },
  { id: 'editor-autosave-delay', section: 'editor', label: 'Autosave delay', description: 'Delay before writing the latest edit.' },
  { id: 'vault-active', section: 'vaults', label: 'Active vault', description: 'Current local workspace folder.' },
  { id: 'vault-open', section: 'vaults', label: 'Open vaults', description: 'Review or remove registered vaults.' },
  { id: 'addons-installed', section: 'addons', label: 'Installed addons', description: 'Built-in and community addon packages.' },
  { id: 'addons-community', section: 'addons', label: 'Community addons', description: 'Risk acknowledgement and third-party addon activation.' },
  { id: 'addons-commands', section: 'addons', label: 'Addon commands', description: 'Run commands contributed by enabled addons.' },
  { id: 'sync-overview', section: 'sync', subpage: 'overview', label: 'Synchronization status', description: 'Active vault, device identity and last transfer.' },
  { id: 'sync-devices', section: 'sync', subpage: 'devices', label: 'Pair devices', description: 'Create or accept an encrypted Iroh invitation.' },
  { id: 'sync-conflicts', section: 'sync', subpage: 'conflicts', label: 'Conflict retention', description: 'Keep, restore or delete temporary conflict copies.' },
  { id: 'ai-providers', section: 'ai', subpage: 'provider', label: 'AI providers', description: 'Local runtime, external APIs and Codex.' },
  { id: 'ai-chat', section: 'ai', subpage: 'chat', label: 'Chat model and RAG', description: 'Model, tools, streaming, prompt and generation settings.' },
  { id: 'ai-search', section: 'ai', subpage: 'embedding', label: 'Semantic search and embeddings', description: 'Indexing, chunking and retrieval settings.' },
  { id: 'ai-ocr', section: 'ai', subpage: 'ocr', label: 'OCR', description: 'Recognition model, languages and image processing.' },
  { id: 'sites-preview', section: 'sites', label: 'Site preview', description: 'Enable, open or stop the generated static site.' },
  { id: 'import-keep', section: 'import', label: 'Google Keep import', description: 'Convert a Keep archive into Markdown.' },
  { id: 'import-web', section: 'import', label: 'Web page import', description: 'Save a URL into the active vault.' },
  { id: 'import-rss', section: 'import', label: 'RSS import', description: 'Import feed items into local notes.' }
].map((entry) => ({ ...entry, sectionLabel: sectionById[entry.section].label, icon: sectionById[entry.section].icon }))

const activeSection = ref('appearance')
const settingsQuery = ref('')
const syncInitialPage = ref('overview')
const aiInitialPage = ref('provider')
const searchInput = ref(null)
const settingsContent = ref(null)
const isMacOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)
const activeSectionMeta = computed(() => sectionById[activeSection.value] || sections[0])
const searchResults = computed(() => {
  const terms = settingsQuery.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return settingsIndex.filter((entry) => {
    const haystack = `${entry.label} ${entry.description} ${entry.sectionLabel}`.toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
})

const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const themeFamilies = ELEPHANTNOTE_THEME_FAMILIES
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const activeThemeFamily = computed(() => getThemeFamily(theme.value))
const activeThemeLabel = computed(() => getThemeLabel(theme.value))
const settingsStyle = computed(() => {
  const tokens = getThemeTokens(theme.value)
  return {
    ...tokens,
    '--en-card': tokens['--en-soft'],
    '--en-accent': tokens['--en-primary'],
    '--en-active-bg': tokens['--selectionColor'],
    '--en-active-border': tokens['--en-primary'],
    '--en-active-text': tokens['--en-primary']
  }
})

const preferences = usePreferencesStore()
const sitePreviewStore = useSitePreviewStore()
const vaultStore = useVaultStore()
const featureFlags = ref({ askAi: true, sitePreview: false, gitSync: false })
const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const importMessage = ref('')
const vaultMessage = ref('')
const removingVaultId = ref('')
const isImporting = ref(false)
const isImportingSource = ref(false)
const siteStatusLabel = computed(() => sitePreviewStore.previewUrl ? 'Preview running' : sitePreviewStore.lastBuild?.outputDir ? 'Static build ready' : 'No generated site active')

const scrollContentToTop = () => nextTick(() => settingsContent.value?.scrollTo({ top: 0, behavior: 'instant' }))
const selectSection = (section) => {
  activeSection.value = section
  settingsQuery.value = ''
  log.info('[settings] section:selected', { section })
  scrollContentToTop()
}
const openSearchResult = (result) => {
  activeSection.value = result.section
  if (result.section === 'sync') syncInitialPage.value = result.subpage || 'overview'
  if (result.section === 'ai') aiInitialPage.value = result.subpage || 'provider'
  settingsQuery.value = ''
  log.info('[settings] search-result:opened', { id: result.id, section: result.section })
  scrollContentToTop()
}
const setPreference = (type, value) => preferences.SET_SINGLE_PREFERENCE({ type, value })
const setQuickInsertTrigger = (value) => setPreference('quickInsertTrigger', String(value || '/').slice(0, 1))
const setNoteEditorMargin = (value) => setPreference('noteEditorMargin', Math.max(8, Math.min(160, Number(value) || 24)))

const removeVaultFromApp = async (vault) => {
  if (!vault?.id) return
  if (!window.confirm(`Remove "${vault.name}" from ElephantNote? The folder stays on disk.`)) return
  removingVaultId.value = vault.id
  vaultMessage.value = ''
  log.info('[settings] vault-remove:start', { id: vault.id, path: vault.path })
  try {
    await vaultStore.removeVault(vault.id)
    vaultMessage.value = `Removed ${vault.name} from ElephantNote. The folder still exists.`
    log.info('[settings] vault-remove:done', { id: vault.id })
  } catch (error) {
    log.error('[settings] vault-remove:failed', error)
    vaultMessage.value = error instanceof Error ? error.message : 'Unable to remove vault.'
  } finally {
    removingVaultId.value = ''
  }
}

const importGoogleKeep = async () => {
  log.info('[settings] importGoogleKeep:start')
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await elephantnoteClient.imports.googleKeep()
    importMessage.value = result?.canceled ? 'Import canceled.' : `Imported ${result.imported || 0} note${result.imported === 1 ? '' : 's'}.`
    log.info('[settings] importGoogleKeep:done', result)
  } catch (error) {
    log.error('[settings] importGoogleKeep:failed', error)
    importMessage.value = error instanceof Error ? error.message : 'Import failed.'
  } finally {
    isImporting.value = false
  }
}

const ingestSourceUrl = async () => {
  log.info('[settings] ingestSourceUrl:start', { url: sourceUrl.value, destination: sourceDestination.value })
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.ingestUrl(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.source?.title || 'source'}.`
    log.info('[settings] ingestSourceUrl:done', result)
  } catch (error) {
    log.error('[settings] ingestSourceUrl:failed', error)
    sourceImportMessage.value = error instanceof Error ? error.message : 'Source import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const importRssSource = async () => {
  log.info('[settings] importRssSource:start', { url: sourceUrl.value, destination: sourceDestination.value })
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.importRss(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`
    log.info('[settings] importRssSource:done', result)
  } catch (error) {
    log.error('[settings] importRssSource:failed', error)
    sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const stopSitePreview = async () => {
  log.info('[settings] stopSitePreview:start')
  await sitePreviewStore.stopPreview()
  sitePreviewStore.clear()
  log.info('[settings] stopSitePreview:done')
}

const toggleFeature = async (key) => {
  log.info('[settings] toggleFeature:start', { key, enabled: !featureFlags.value[key] })
  try {
    featureFlags.value = await elephantnoteClient.features.set(key, !featureFlags.value[key])
    log.info('[settings] toggleFeature:done', featureFlags.value)
  } catch (error) {
    log.warn('[settings] toggleFeature:failed', error)
  }
}

const handleKeyboard = (event) => {
  if (event.key === 'Escape') emit('close')
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
    event.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard)
  log.info('[settings] mounted:start', { sections: sections.map((section) => section.id) })
  try {
    featureFlags.value = await elephantnoteClient.features.get()
    log.info('[settings] featureFlags:loaded', featureFlags.value)
  } catch (error) {
    log.warn('[settings] featureFlags:failed', error)
  }
  sitePreviewStore.refresh?.()
  log.info('[settings] mounted:done', { theme: activeThemeLabel.value, addonsRegistered: Boolean(window.__ELEPHANT_ADDONS__) })
})

onBeforeUnmount(() => window.removeEventListener('keydown', handleKeyboard))
</script>

<style scoped src="./settings-redesign.css"></style>

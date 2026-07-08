<template>
  <div
    class="en-settings-backdrop"
    :class="[`en-theme-${themeMode}`, `en-theme-${themeClassId}`]"
    :style="settingsStyle"
    @click.self="$emit('close')"
  >
    <section class="en-settings-panel" :style="settingsStyle" aria-label="ElephantNote settings">
      <header class="en-settings-header">
        <div class="en-settings-title">
          <span class="en-settings-app-mark">E</span>
          <div>
            <p>ElephantNote</p>
            <h2>Settings</h2>
          </div>
        </div>
        <label class="en-settings-search">
          <Search aria-hidden="true" />
          <input v-model.trim="settingsQuery" type="search" placeholder="Search settings" aria-label="Search settings">
        </label>
        <button class="en-icon-button en-settings-close" type="button" aria-label="Close settings" @click="$emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="en-settings-grid">
        <aside class="en-settings-nav" aria-label="Settings sections">
          <div v-for="group in visibleNavGroups" :key="group.label" class="en-settings-nav-group">
            <p>{{ group.label }}</p>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              :class="{ active: activeSection === item.id }"
              @click="activeSection = item.id"
            >
              <component :is="item.icon" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <ChevronRight class="en-settings-nav-chevron" aria-hidden="true" />
            </button>
          </div>
          <div v-if="!visibleNavGroups.length" class="en-settings-empty-search">
            <Search aria-hidden="true" />
            <strong>No setting found</strong>
            <span>Try another keyword.</span>
          </div>
          <footer class="en-settings-nav-footer">
            <span>Local-first</span>
            <span>v0.18.9</span>
          </footer>
        </aside>

        <main class="en-settings-content">
          <div class="en-settings-page-header">
            <div>
              <div class="en-settings-page-kicker">
                <component :is="activeSectionMeta.icon" aria-hidden="true" />
                <span>{{ activeSectionMeta.group }}</span>
              </div>
              <h1>{{ activeSectionMeta.label }}</h1>
              <p>{{ activeSectionMeta.description }}</p>
            </div>
          </div>

          <template v-if="activeSection === 'appearance'">
            <section class="en-settings-group">
              <div class="en-settings-group-heading">
                <h3>Interface</h3>
                <p>Choose the base color mode and visual family used throughout ElephantNote.</p>
              </div>

              <div class="en-settings-row">
                <div class="en-settings-row-copy">
                  <strong>Color mode</strong>
                  <span>Switch between the light and dark variants of the active theme.</span>
                </div>
                <div class="en-segmented" aria-label="Color mode">
                  <button type="button" :class="{ active: themeMode === 'light' }" @click="emit('update-theme', getThemeVariant(activeThemeFamily.id, 'light'))">
                    <SunMedium aria-hidden="true" /> Light
                  </button>
                  <button type="button" :class="{ active: themeMode === 'dark' }" @click="emit('update-theme', getThemeVariant(activeThemeFamily.id, 'dark'))">
                    <Moon aria-hidden="true" /> Dark
                  </button>
                </div>
              </div>

              <div class="en-settings-row en-settings-row-stacked">
                <div class="en-settings-row-copy">
                  <strong>Graphic theme</strong>
                  <span>Each family keeps coordinated light and dark variants.</span>
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
                    <span class="en-theme-card-preview" :style="{ background: family.swatches[0] }">
                      <i class="sidebar" :style="{ background: family.swatches[1] }" />
                      <i class="canvas" :style="{ background: family.swatches[2] }">
                        <b :style="{ background: family.swatches[3] || family.swatches[2] }" />
                        <b :style="{ background: family.swatches[3] || family.swatches[2] }" />
                      </i>
                    </span>
                    <span class="en-theme-card-copy">
                      <strong>{{ family.name }}</strong>
                      <small>{{ family.description }}</small>
                    </span>
                    <span v-if="activeThemeFamily.id === family.id" class="en-theme-card-check"><Check aria-hidden="true" /></span>
                  </button>
                </div>
              </div>
            </section>

            <section class="en-settings-group">
              <div class="en-settings-group-heading">
                <h3>Layout</h3>
                <p>Adjust the workspace without changing the content of your vault.</p>
              </div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy">
                  <strong>Sidebar width</strong>
                  <span>The navigation panel can also be resized directly by dragging its edge.</span>
                </div>
                <label class="en-range-control">
                  <input type="range" min="184" max="320" :value="sidebarWidth" @input="$emit('update-sidebar-width', Number($event.target.value))">
                  <output>{{ sidebarWidth }} px</output>
                </label>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'editor'">
            <section class="en-settings-group">
              <div class="en-settings-group-heading">
                <h3>Editor interface</h3>
                <p>Keep the writing surface focused while retaining the tools you use.</p>
              </div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Editor footer</strong><span>Show word count, typography controls and the theme shortcut.</span></div>
                <button class="en-switch" type="button" role="switch" aria-label="Show editor footer" :aria-checked="preferences.showEditorFooter" :class="{ active: preferences.showEditorFooter }" @click="setShowEditorFooter(!preferences.showEditorFooter)"><span /></button>
              </div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Tag prefix</strong><span>Display the # prefix before tag names inside notes.</span></div>
                <button class="en-switch" type="button" role="switch" aria-label="Show tag prefix" :aria-checked="preferences.showTagHashInEditor" :class="{ active: preferences.showTagHashInEditor }" @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)"><span /></button>
              </div>
            </section>

            <section class="en-settings-group">
              <div class="en-settings-group-heading">
                <h3>Writing</h3>
                <p>Control the reading width and how quickly changes are persisted.</p>
              </div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Note margins</strong><span>Set the horizontal breathing room around the title and text.</span></div>
                <label class="en-range-control">
                  <input type="range" min="8" max="160" step="4" :value="preferences.noteEditorMargin" @input="setNoteEditorMargin(Number($event.target.value))">
                  <output>{{ preferences.noteEditorMargin }} px</output>
                </label>
              </div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Autosave delay</strong><span>Choose how long ElephantNote waits after an edit before writing to disk.</span></div>
                <select class="en-compact-select" :value="preferences.autoSaveDelay" @change="setAutoSaveDelay(Number($event.target.value))">
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
              <div class="en-settings-group-heading"><h3>Current workspace</h3><p>The active vault remains a normal folder on your device.</p></div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>
                <span class="en-status-badge active"><HardDrive aria-hidden="true" />{{ activeVaultName }}</span>
              </div>
            </section>

            <section class="en-settings-group">
              <div class="en-settings-group-heading"><h3>Open vaults</h3><p>Removing a vault here never deletes its folder or notes from disk.</p></div>
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

          <template v-else-if="activeSection === 'import'">
            <section class="en-settings-group">
              <div class="en-settings-group-heading"><h3>Import notes</h3><p>Bring existing content into the active vault as local Markdown files.</p></div>
              <div class="en-settings-row">
                <div class="en-settings-row-copy"><strong>Google Keep archive</strong><span>Select an exported archive and convert its notes into Markdown.</span></div>
                <button class="en-primary-button" type="button" :disabled="isImporting" @click="importGoogleKeep"><Download aria-hidden="true" />{{ isImporting ? 'Importing…' : 'Import Google Keep' }}</button>
              </div>
            </section>

            <section class="en-settings-group">
              <div class="en-settings-group-heading"><h3>Web sources</h3><p>Save a web page or an RSS feed directly into a destination folder.</p></div>
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

            <section class="en-settings-group">
              <div class="en-settings-group-heading"><h3>Generated site</h3><p>Build and manage the static preview for the current folder.</p></div>
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

          <template v-else-if="activeSection === 'sync'">
            <sync-settings-panel :vaults="vaults" :active-vault-path="activeVaultPath" />
          </template>

          <template v-else-if="activeSection === 'ai'">
            <ai-provider-settings-panel />
          </template>
        </main>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
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
  Palette,
  PenLine,
  Search,
  Sparkles,
  SunMedium,
  X
} from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_THEME_FAMILIES, getThemeFamily, getThemeLabel, getThemeMode, getThemeTokens, getThemeVariant } from 'common/elephantnote/appearance'
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

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { id: 'appearance', label: 'Appearance', description: 'Theme, visual family and workspace proportions.', icon: Palette, keywords: 'theme dark light color sidebar layout' },
      { id: 'editor', label: 'Editor', description: 'Writing surface, tags, margins and autosave.', icon: PenLine, keywords: 'writing footer tags margin autosave' },
      { id: 'vaults', label: 'Vaults', description: 'Review the local folders currently registered in ElephantNote.', icon: FolderOpen, keywords: 'folders storage workspace remove' }
    ]
  },
  {
    label: 'Services',
    items: [
      { id: 'sync', label: 'Sync', description: 'Pair devices, synchronize vaults and manage conflicts.', icon: Cloud, keywords: 'iroh device pairing conflict transfer' },
      { id: 'ai', label: 'AI', description: 'Configure providers, chat, embeddings and OCR.', icon: Sparkles, keywords: 'provider model chat embedding ocr codex local' }
    ]
  },
  {
    label: 'Data',
    items: [
      { id: 'import', label: 'Import & sites', description: 'Import notes and web sources, then manage static previews.', icon: Download, keywords: 'google keep rss url website preview export' }
    ]
  }
]

const activeSection = ref('appearance')
const settingsQuery = ref('')
const allSections = navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
const activeSectionMeta = computed(() => allSections.find((item) => item.id === activeSection.value) || allSections[0])
const visibleNavGroups = computed(() => {
  const query = settingsQuery.value.toLocaleLowerCase()
  if (!query) return navGroups
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase().includes(query)) }))
    .filter((group) => group.items.length)
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
const setAutoSaveDelay = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'autoSaveDelay', value })
const setShowEditorFooter = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'showEditorFooter', value })
const setShowTagHashInEditor = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'showTagHashInEditor', value })
const setNoteEditorMargin = (value) => preferences.SET_SINGLE_PREFERENCE({ type: 'noteEditorMargin', value: Math.max(8, Math.min(160, Number(value) || 24)) })

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

onMounted(async () => {
  log.info('[settings] mounted:start')
  try {
    featureFlags.value = await elephantnoteClient.features.get()
    log.info('[settings] featureFlags:loaded', featureFlags.value)
  } catch (error) {
    log.warn('[settings] featureFlags:failed', error)
  }
  sitePreviewStore.refresh?.()
  log.info('[settings] mounted:done', { theme: activeThemeLabel.value })
})
</script>

<style scoped src="./settings-redesign.css"></style>

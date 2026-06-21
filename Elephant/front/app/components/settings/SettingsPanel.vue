<template>
  <div class="en-settings-backdrop" :class="[`en-theme-${themeMode}`, `en-theme-${themeClassId}`]" :style="settingsStyle" @click.self="$emit('close')">
    <section class="en-settings-panel" :style="settingsStyle" aria-label="ElephantNote settings">
      <header class="en-settings-header">
        <button class="en-settings-close" type="button" @click="$emit('close')"><X class="en-icon" /></button>
        <div><p>ElephantNote</p><h2>Settings</h2></div>
      </header>

      <div class="en-settings-grid">
        <aside class="en-settings-nav">
          <button v-for="item in sections" :key="item.id" type="button" :class="{ active: activeSection === item.id }" @click="activeSection = item.id">{{ item.label }}</button>
        </aside>

        <div class="en-settings-content">
          <template v-if="activeSection === 'appearance'">
            <section class="en-settings-section">
              <div><h3>Theme</h3><p>{{ activeThemeLabel }}</p></div>
              <button class="en-theme-switch" type="button" :class="{ dark: themeMode === 'dark' }" @click="emit('update-theme', oppositeTheme)"><SunMedium class="en-theme-icon light" /><Moon class="en-theme-icon dark" />{{ themeMode === 'dark' ? 'Dark' : 'Light' }}</button>
            </section>
            <section class="en-settings-section stacked">
              <div><h3>Graphic themes</h3><p>Choose a visual family. Each family keeps matching light and dark variants.</p></div>
              <div class="en-theme-grid">
                <button v-for="family in themeFamilies" :key="family.id" type="button" class="en-theme-card" :class="{ active: activeThemeFamily.id === family.id }" @click="emit('update-theme', getThemeVariant(family.id, themeMode))">
                  <span class="en-theme-card-preview"><i v-for="swatch in family.swatches" :key="swatch" :style="{ backgroundColor: swatch }" /></span>
                  <span class="en-theme-card-copy"><strong>{{ family.name }}</strong><small>{{ family.description }}</small></span>
                </button>
              </div>
            </section>
            <section class="en-settings-section">
              <div><h3>Sidebar width</h3><p>The navigation rail can also be resized by dragging its right edge.</p></div>
              <label class="en-settings-range"><input type="range" min="184" max="320" :value="sidebarWidth" @input="$emit('update-sidebar-width', Number($event.target.value))"><output>{{ sidebarWidth }}px</output></label>
            </section>
          </template>

          <template v-else-if="activeSection === 'vaults'">
            <section class="en-settings-section"><div><h3>Active vault</h3><p>The current vault path is shown here.</p></div><span class="en-settings-pill">{{ activeVaultName }}</span></section>
            <section class="en-settings-section stacked"><div><h3>Open vaults</h3><p>Remove a vault from ElephantNote without deleting the folder from disk.</p></div><div class="en-vault-list"><article v-for="vault in vaults" :key="vault.id" class="en-vault-row"><div><strong>{{ vault.name }}</strong><p class="en-settings-path">{{ vault.path }}</p></div><button type="button" class="danger" :disabled="removingVaultId === vault.id" @click="removeVaultFromApp(vault)">{{ removingVaultId === vault.id ? 'Removing...' : 'Remove from app' }}</button></article></div><span class="en-settings-message">{{ vaultMessage }}</span></section>
          </template>

          <template v-else-if="activeSection === 'editor'">
            <section class="en-settings-section"><div><h3>Editor footer</h3><p>Show the bottom bar with word count, typography controls, and theme shortcut.</p></div><button class="en-settings-toggle-pill" type="button" :class="{ active: preferences.showEditorFooter }" @click="setShowEditorFooter(!preferences.showEditorFooter)">{{ preferences.showEditorFooter ? 'Visible' : 'Hidden' }}</button></section>
            <section class="en-settings-section"><div><h3>Tag prefix</h3><p>Show or hide the # prefix before tag names in the note editor.</p></div><button class="en-settings-toggle-pill" type="button" :class="{ active: preferences.showTagHashInEditor }" @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)">{{ preferences.showTagHashInEditor ? 'Show #' : 'Hide #' }}</button></section>
            <section class="en-settings-section stacked"><div><h3>Note margins</h3><p>Set the horizontal margin used by the note title and text.</p></div><label class="en-settings-range"><input type="range" min="8" max="160" step="4" :value="preferences.noteEditorMargin" @input="setNoteEditorMargin(Number($event.target.value))"><output>{{ preferences.noteEditorMargin }} px</output></label></section>
            <section class="en-settings-section stacked"><div><h3>Autosave</h3><p>Changes are written automatically after a short delay.</p></div><label class="en-settings-range"><input type="range" min="250" max="5000" step="250" :value="preferences.autoSaveDelay" @input="setAutoSaveDelay(Number($event.target.value))"><output>{{ preferences.autoSaveDelay }} ms</output></label></section>
          </template>

          <template v-else-if="activeSection === 'import'">
            <section class="en-settings-section"><div><h3>Import notes</h3><p>Bring notes from a Google Keep export into the active vault.</p></div><button type="button" :disabled="isImporting" @click="importGoogleKeep"><Download class="en-icon" />{{ isImporting ? 'Importing...' : 'Import Google Keep' }}</button></section>
            <section class="en-settings-section stacked"><div><h3>Sources</h3><p>Ingest a web page or RSS feed into local markdown notes.</p></div><div class="en-form-grid"><label><span>URL</span><input v-model.trim="sourceUrl" type="text" placeholder="https://example.com/article"></label><label><span>Destination folder</span><input v-model.trim="sourceDestination" type="text" placeholder="Sources"></label></div><div class="en-settings-actions-row"><button type="button" :disabled="isImportingSource || !sourceUrl" @click="ingestSourceUrl">Import URL</button><button type="button" :disabled="isImportingSource || !sourceUrl" @click="importRssSource">Import RSS</button><span class="en-settings-message">{{ sourceImportMessage || importMessage }}</span></div></section>
          </template>

          <template v-else-if="activeSection === 'sites'">
            <section class="en-settings-section stacked"><div><h3>Generated sites</h3><p>Manage the current folder website preview.</p></div><div class="en-settings-actions-row"><button type="button" :class="{ active: featureFlags.sitePreview }" @click="toggleFeature('sitePreview')">{{ featureFlags.sitePreview ? 'Enabled' : 'Disabled' }}</button><span class="en-settings-pill">{{ siteStatusLabel }}</span><button type="button" :disabled="!sitePreviewStore.previewUrl" @click="sitePreviewStore.openPreviewExternal">Open</button><button type="button" :disabled="!sitePreviewStore.info" @click="stopSitePreview">Stop</button></div></section>
          </template>

          <template v-else-if="activeSection === 'sync'">
            <sync-settings-panel :vaults="vaults" :active-vault-path="activeVaultPath" />
          </template>

          <template v-else-if="activeSection === 'ai'"><ai-provider-settings-panel /></template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import log from 'electron-log/renderer'
import { Download, Moon, SunMedium, X } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_THEME_FAMILIES, getOppositeThemeVariant, getThemeFamily, getThemeLabel, getThemeMode, getThemeTokens, getThemeVariant } from 'common/elephantnote/appearance'
import AiProviderSettingsPanel from './AiProviderSettingsPanel.vue'
import SyncSettingsPanel from './SyncSettingsPanel.vue'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { useVaultStore } from '../../stores/vaultStore'

const props = defineProps({ theme: { type: String, required: true }, sidebarWidth: { type: Number, required: true }, vaults: { type: Array, default: () => [] }, activeVaultName: { type: String, default: 'No vault' }, activeVaultPath: { type: String, default: '' } })
const emit = defineEmits(['close', 'update-theme', 'update-sidebar-width'])
const sections = [{ id: 'appearance', label: 'Appearance' }, { id: 'vaults', label: 'Vaults' }, { id: 'editor', label: 'Editor' }, { id: 'import', label: 'Import' }, { id: 'sites', label: 'Sites' }, { id: 'sync', label: 'Sync' }, { id: 'ai', label: 'AI' }]
const activeSection = ref('appearance')
const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const themeFamilies = ELEPHANTNOTE_THEME_FAMILIES
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const activeThemeFamily = computed(() => getThemeFamily(theme.value))
const activeThemeLabel = computed(() => getThemeLabel(theme.value))
const oppositeTheme = computed(() => getOppositeThemeVariant(theme.value))
const settingsStyle = computed(() => { const tokens = getThemeTokens(theme.value); return { ...tokens, '--en-card': tokens['--en-soft'], '--en-accent': tokens['--en-primary'], '--en-active-bg': tokens['--selectionColor'], '--en-active-border': tokens['--en-primary'], '--en-active-text': tokens['--en-primary'] } })
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
const removeVaultFromApp = async (vault) => { if (!vault?.id) return; if (!window.confirm(`Remove "${vault.name}" from ElephantNote? The folder stays on disk.`)) return; removingVaultId.value = vault.id; vaultMessage.value = ''; log.info('[settings] vault-remove:start', { id: vault.id, path: vault.path }); try { await vaultStore.removeVault(vault.id); vaultMessage.value = `Removed ${vault.name} from ElephantNote. The folder still exists.`; log.info('[settings] vault-remove:done', { id: vault.id }) } catch (error) { log.error('[settings] vault-remove:failed', error); vaultMessage.value = error instanceof Error ? error.message : 'Unable to remove vault.' } finally { removingVaultId.value = '' } }
const importGoogleKeep = async () => { log.info('[settings] importGoogleKeep:start'); isImporting.value = true; importMessage.value = ''; try { const result = await elephantnoteClient.imports.googleKeep(); importMessage.value = result?.canceled ? 'Import canceled.' : `Imported ${result.imported || 0} note${result.imported === 1 ? '' : 's'}.`; log.info('[settings] importGoogleKeep:done', result) } catch (error) { log.error('[settings] importGoogleKeep:failed', error); importMessage.value = error instanceof Error ? error.message : 'Import failed.' } finally { isImporting.value = false } }
const ingestSourceUrl = async () => { log.info('[settings] ingestSourceUrl:start', { url: sourceUrl.value, destination: sourceDestination.value }); isImportingSource.value = true; try { const result = await elephantnoteClient.sources.ingestUrl(sourceUrl.value, sourceDestination.value || 'Sources'); sourceImportMessage.value = `Imported ${result.source?.title || 'source'}.`; log.info('[settings] ingestSourceUrl:done', result) } catch (error) { log.error('[settings] ingestSourceUrl:failed', error); sourceImportMessage.value = error instanceof Error ? error.message : 'Source import failed.' } finally { isImportingSource.value = false } }
const importRssSource = async () => { log.info('[settings] importRssSource:start', { url: sourceUrl.value, destination: sourceDestination.value }); isImportingSource.value = true; try { const result = await elephantnoteClient.sources.importRss(sourceUrl.value, sourceDestination.value || 'Sources'); sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`; log.info('[settings] importRssSource:done', result) } catch (error) { log.error('[settings] importRssSource:failed', error); sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.' } finally { isImportingSource.value = false } }
const stopSitePreview = async () => { log.info('[settings] stopSitePreview:start'); await sitePreviewStore.stopPreview(); sitePreviewStore.clear(); log.info('[settings] stopSitePreview:done') }
const toggleFeature = async (key) => { log.info('[settings] toggleFeature:start', { key, enabled: !featureFlags.value[key] }); try { featureFlags.value = await elephantnoteClient.features.set(key, !featureFlags.value[key]); log.info('[settings] toggleFeature:done', featureFlags.value) } catch (error) { log.warn('[settings] toggleFeature:failed', error) } }
onMounted(async () => { log.info('[settings] mounted:start'); try { featureFlags.value = await elephantnoteClient.features.get(); log.info('[settings] featureFlags:loaded', featureFlags.value) } catch (error) { log.warn('[settings] featureFlags:failed', error) } sitePreviewStore.refresh?.(); log.info('[settings] mounted:done') })
</script>

<style scoped>
.en-settings-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, 0.38); color: var(--en-text, #101828); }
.en-settings-backdrop.en-theme-dark { background: rgba(3, 7, 18, 0.62); }
.en-settings-panel { width: min(1120px, 92vw); height: min(820px, 88vh); display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; border: 1px solid var(--en-border, #c5cfdd); border-radius: 22px; background: var(--en-surface, #ffffff); color: var(--en-text, #101828); box-shadow: var(--en-card-shadow, 0 30px 90px rgba(15, 23, 42, 0.16)); }
.en-settings-header { display: flex; align-items: center; justify-content: flex-start; gap: 14px; padding: 20px 24px; border-bottom: 1px solid var(--en-border, #c5cfdd); background: var(--en-surface, #ffffff); }
.en-settings-header p { margin: 0; color: var(--en-muted, #475467); text-transform: uppercase; letter-spacing: 0.16em; font-size: 12px; }
.en-settings-header h2 { margin: 2px 0 0; font-size: 24px; color: var(--en-text, #101828); }
.en-settings-close, .en-settings-panel button, .en-settings-panel select, .en-settings-panel input { border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: var(--en-soft, #e9eff7); color: var(--en-text, #101828); }
.en-settings-panel button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 34px; padding: 0 14px; cursor: pointer; transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease; }
.en-settings-panel button:hover:not(:disabled) { background: var(--en-soft-strong, #dfe7f1); border-color: var(--en-border-strong, #aebacd); }
.en-settings-panel button:focus-visible, .en-settings-panel input:focus-visible, .en-settings-panel select:focus-visible { outline: 2px solid var(--en-primary, #2563eb); outline-offset: 2px; }
.en-settings-panel button:disabled { opacity: 0.5; cursor: not-allowed; }
.en-settings-panel button.active, .en-settings-toggle-pill.active, .en-theme-card.active { border-color: var(--en-active-border, var(--en-primary, #2563eb)); color: var(--en-active-text, var(--en-primary, #2563eb)); background: var(--en-active-bg, var(--selectionColor, rgba(37, 99, 235, 0.14))); }
.en-settings-panel button.danger { border-color: var(--en-danger, #dc2626); color: var(--en-danger, #dc2626); background: transparent; }
.en-icon { width: 16px; height: 16px; }
.en-settings-grid { min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr); border-top: 1px solid transparent; }
.en-settings-nav { display: flex; flex-direction: column; gap: 10px; padding: 18px 14px; border-right: 1px solid var(--en-border, #c5cfdd); background: var(--en-surface, #ffffff); }
.en-settings-nav button { justify-content: flex-start; min-height: 42px; font-size: 14px; }
.en-settings-content { min-width: 0; overflow: auto; padding: 24px 28px; background: var(--en-card, #e9eff7); }
.en-settings-section { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px; margin-bottom: 18px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 18px; background: var(--en-surface, #fff); }
.en-settings-section.stacked { align-items: stretch; flex-direction: column; }
.en-settings-section h3 { margin: 0 0 6px; font-size: 18px; }
.en-settings-section p { margin: 0; color: var(--en-muted, #475467); font-size: 14px; line-height: 1.5; }
.en-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.en-form-grid label { display: flex; flex-direction: column; gap: 8px; color: var(--en-muted, #475467); }
.en-form-grid input, .en-form-grid select { height: 42px; padding: 0 12px; background: var(--en-surface, #fff); }
.en-settings-actions-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.en-settings-message { color: var(--en-muted, #475467); font-size: 13px; }
.en-settings-pill { display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; background: var(--en-soft, #e9eff7); color: var(--en-muted, #475467); }
.en-settings-path { word-break: break-all; }
.en-vault-list { display: flex; flex-direction: column; gap: 12px; }
.en-vault-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 14px; }
.en-settings-range { display: flex; align-items: center; gap: 12px; }
.en-settings-range input { min-width: 180px; }
.en-theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-theme-card { min-height: 82px; justify-content: flex-start !important; }
.en-theme-card-preview { display: inline-flex; gap: 4px; }
.en-theme-card-preview i { width: 16px; height: 42px; border-radius: 999px; }
.en-theme-card-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
</style>

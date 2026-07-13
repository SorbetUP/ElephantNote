<template>
  <section class="en-wiki-library">
    <header class="en-wiki-toolbar">
      <div class="en-wiki-heading">
        <h1>Wikis</h1>
        <span>{{ wikiCount }} wiki{{ wikiCount === 1 ? '' : 's' }}</span>
        <span v-if="suggestionCount">{{ suggestionCount }} proposition{{ suggestionCount === 1 ? '' : 's' }}</span>
      </div>

      <div class="en-wiki-toolbar-actions">
        <div class="en-wiki-topic-entry">
          <input
            v-model.trim="manualTopic"
            type="text"
            placeholder="Ajouter un sujet de Wiki…"
            @keydown.enter.prevent="addManualTopic"
          >
          <button type="button" :disabled="!manualTopic || loading" @click="addManualTopic">
            <Plus class="en-icon" /> Ajouter
          </button>
        </div>
        <button
          class="en-toolbar-button"
          type="button"
          :disabled="loading || discovering"
          @click="discoverWithAi"
        >
          <Sparkles class="en-icon" />
          {{ discovering ? 'Analyse sémantique…' : 'Proposer avec l’IA' }}
        </button>
        <button
          class="en-toolbar-button"
          type="button"
          :disabled="loading"
          @click="analyseNotes"
        >
          <RotateCw :class="['en-icon', { spinning: loading }]" />
          Analyser les notes
        </button>
        <select v-model="store.sort" class="en-select">
          <option value="updated-newest">Sort: Updated newest</option>
          <option value="updated-oldest">Sort: Updated oldest</option>
          <option value="title">Sort: Title A-Z</option>
        </select>
        <div class="en-view-toggle">
          <button
            type="button"
            :class="{ active: store.viewMode === 'grid' }"
            title="Grid"
            @click="store.viewMode = 'grid'"
          >
            <Grid3x3 class="en-icon" />
          </button>
          <button
            type="button"
            :class="{ active: store.viewMode === 'list' }"
            title="List"
            @click="store.viewMode = 'list'"
          >
            <List class="en-icon" />
          </button>
        </div>
      </div>
    </header>

    <div v-if="runtimeUnavailable" class="en-wiki-message error">
      Le moteur Wiki Rust n’est pas disponible dans ce runtime.
    </div>
    <div v-else-if="globalError" class="en-wiki-message error">
      <AlertCircle class="en-icon" />
      <span>{{ globalError }}</span>
      <button type="button" @click="globalError = ''">Fermer</button>
    </div>

    <div
      v-if="!runtimeUnavailable"
      class="en-wiki-grid"
      :class="{ list: store.viewMode === 'list', empty: !sortedEntries.length && !loading }"
    >
      <div v-if="loading && !sortedEntries.length" class="en-wiki-empty">
        <LoaderCircle class="en-empty-icon spinning" />
        <strong>Analyse des notes…</strong>
      </div>

      <div v-else-if="!sortedEntries.length" class="en-wiki-empty">
        <FileText class="en-empty-icon" />
        <strong>Aucun wiki ni sujet suffisamment cohérent</strong>
        <span>Les propositions apparaîtront ici dès qu’un thème est partagé par plusieurs notes.</span>
      </div>

      <article
        v-for="entry in sortedEntries"
        v-else
        :key="entry.id"
        class="en-wiki-card"
        :class="{
          suggestion: entry.kind === 'suggestion',
          selected: selectedSuggestionId === entry.id,
          outdated: entry.status === 'outdated',
          busy: isBusy(entry.id)
        }"
        @click="handleCardClick(entry)"
      >
        <div class="en-card-actions">
          <span v-if="entry.kind === 'suggestion'" class="en-status suggested">Proposition</span>
          <span v-else-if="entry.status === 'outdated'" class="en-status outdated">À actualiser</span>
          <span v-else-if="entry.status === 'draft'" class="en-status draft">Brouillon</span>
          <button
            v-if="entry.kind === 'wiki'"
            class="en-card-menu"
            type="button"
            title="Wiki actions"
            aria-label="Wiki actions"
            @click.stop="toggleMenu(entry.id)"
          >
            <MoreHorizontal class="en-icon" />
          </button>
        </div>

        <div
          v-if="openMenuId === entry.id"
          class="en-card-popover"
          @click.stop
        >
          <button
            v-if="entry.path"
            type="button"
            @click="openWiki(entry)"
          >
            <FileText class="en-popover-icon" /> Modifier
          </button>
          <button
            type="button"
            class="danger"
            :disabled="isBusy(entry.id)"
            @click="deleteWiki(entry)"
          >
            <Trash2 class="en-popover-icon" /> {{ deleteConfirmId === entry.id ? 'Confirmer la suppression' : 'Supprimer' }}
          </button>
        </div>

        <div class="en-wiki-card-head">
          <div class="en-wiki-title-row">
            <component
              :is="entry.kind === 'suggestion' ? Sparkles : FileText"
              class="en-document-icon"
            />
            <h2>{{ entry.title }}</h2>
          </div>
        </div>

        <p class="en-wiki-excerpt">
          {{ entry.excerpt || 'Wiki sans aperçu.' }}
        </p>

        <section
          v-if="entry.kind === 'suggestion' && selectedSuggestionId === entry.id"
          class="en-wiki-preview"
          @click.stop
        >
          <strong>Ce Wiki proposerait</strong>
          <p>{{ entry.preview || entry.reason }}</p>
          <div v-if="entry.suggestedSections?.length" class="en-wiki-preview-section">
            <span>Plan probable</span>
            <ul>
              <li v-for="section in entry.suggestedSections" :key="section">{{ section }}</li>
            </ul>
          </div>
          <div v-if="entry.sourceTitles?.length" class="en-wiki-preview-section">
            <span>Notes principales</span>
            <ul>
              <li v-for="title in entry.sourceTitles.slice(0, 6)" :key="title">{{ title }}</li>
            </ul>
          </div>
        </section>

        <div class="en-wiki-meta">
          <template v-if="entry.kind === 'suggestion' && entry.status === 'semantic' && entry.coreSourceCount">
            <span>{{ entry.coreSourceCount }} note{{ entry.coreSourceCount === 1 ? '' : 's' }} cœur</span>
            <span v-if="relatedSourceCount(entry)">+{{ relatedSourceCount(entry) }} associée{{ relatedSourceCount(entry) === 1 ? '' : 's' }}</span>
            <span class="en-confidence" :title="confidenceTitle(entry)">{{ confidenceLabel(entry) }}</span>
          </template>
          <span v-else>{{ entry.sourcePaths?.length || 0 }} source{{ entry.sourcePaths?.length === 1 ? '' : 's' }}</span>
          <span v-if="entry.citationsCount">{{ entry.citationsCount }} citation{{ entry.citationsCount === 1 ? '' : 's' }}</span>
          <span v-if="entry.modelId">{{ entry.modelId }}</span>
        </div>

        <div v-if="entryError(entry.id)" class="en-card-error" @click.stop>
          <AlertCircle class="en-icon" />
          <span>{{ entryError(entry.id) }}</span>
        </div>

        <footer v-if="entry.kind === 'suggestion'" class="en-suggestion-actions" @click.stop>
          <button
            class="primary"
            type="button"
            :disabled="isBusy(entry.id)"
            @click="generateSuggestion(entry)"
          >
            <LoaderCircle v-if="isBusy(entry.id)" class="en-button-icon spinning" />
            <Sparkles v-else class="en-button-icon" />
            {{ isBusy(entry.id) ? 'Génération…' : 'Générer' }}
          </button>
          <button
            type="button"
            :disabled="isBusy(entry.id)"
            @click="rejectSuggestion(entry)"
          >
            <X class="en-button-icon" /> Refuser
          </button>
        </footer>

        <footer v-else class="en-wiki-footer">
          <span class="en-dot" />
          <span>{{ formatDate(entry.updatedAt) }}</span>
          <button
            v-if="entry.status === 'draft'"
            type="button"
            :disabled="isBusy(entry.id)"
            @click.stop="publishDraft(entry)"
          >
            Finaliser
          </button>
          <span v-else class="en-edit-hint">Cliquer pour ouvrir et modifier</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertCircle,
  FileText,
  Grid3x3,
  List,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  X
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'

const store = useVaultStore()
const searchStore = useSearchStore()
const entries = ref([])
const loading = ref(false)
const globalError = ref('')
const manualTopic = ref('')
const discovering = ref(false)
const selectedSuggestionId = ref('')
const openMenuId = ref('')
const deleteConfirmId = ref('')
const busyIds = ref(new Set())
const errorsById = ref({})

const runtime = computed(() => globalThis.elephantnote?.knowledge?.wikis)
const runtimeUnavailable = computed(() => typeof runtime.value?.libraryList !== 'function')
const suggestionCount = computed(() => entries.value.filter((entry) => entry.kind === 'suggestion').length)
const wikiCount = computed(() => entries.value.filter((entry) => entry.kind === 'wiki').length)

const sortedEntries = computed(() => {
  const suggestions = entries.value.filter((entry) => entry.kind === 'suggestion')
  const wikis = entries.value.filter((entry) => entry.kind === 'wiki')
  const compare = (left, right) => {
    if (store.sort === 'title') return String(left.title || '').localeCompare(String(right.title || ''))
    const leftDate = Number(left.updatedAt || 0)
    const rightDate = Number(right.updatedAt || 0)
    return store.sort === 'updated-oldest' ? leftDate - rightDate : rightDate - leftDate
  }
  return [...suggestions.sort((left, right) => Number(right.score || 0) - Number(left.score || 0)), ...wikis.sort(compare)]
})

const normalizeError = (error) => error?.message || String(error || 'Erreur inconnue')
const invoke = (command, payload = {}) => {
  const fn = globalThis.window?.__TAURI__?.core?.invoke
  if (typeof fn !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return fn(command, payload)
}
const isBusy = (id) => busyIds.value.has(id)
const entryError = (id) => errorsById.value[id] || ''
const relatedSourceCount = (entry) => Math.max(0, Number(entry?.sourcePaths?.length || 0) - Number(entry?.coreSourceCount || 0))
const confidenceLabel = (entry) => {
  const value = Number(entry?.confidence || 0)
  if (value >= 0.72) return 'Sujet solide'
  if (value >= 0.48) return 'Sujet probable'
  return 'À explorer'
}
const confidenceTitle = (entry) => {
  const confidence = Math.round(Number(entry?.confidence || 0) * 100)
  const distinctiveness = Number(entry?.distinctiveness || 0).toFixed(2)
  return `Confiance ${confidence}% · séparation ${distinctiveness}`
}

const setBusy = (id, value) => {
  const next = new Set(busyIds.value)
  if (value) next.add(id)
  else next.delete(id)
  busyIds.value = next
}

const setEntryError = (id, value = '') => {
  errorsById.value = { ...errorsById.value, [id]: value }
}

const loadLibrary = async() => {
  if (runtimeUnavailable.value || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    const result = await runtime.value.libraryList({ limit: 500 })
    entries.value = Array.isArray(result) ? result : []
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

const refreshKnowledgeViews = async(reason) => {
  window.dispatchEvent(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason } }))
  try {
    await searchStore.inspect()
  } catch {
    // The Wiki operation succeeded; a later Graph open can retry inspection.
  }
}


const addManualTopic = async() => {
  const topic = manualTopic.value.trim()
  if (!topic || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    await invoke('tauri_knowledge_wiki_library_add_candidate', { topic, title: null, sourcePaths: null })
    manualTopic.value = ''
    await loadLibrary()
    await refreshKnowledgeViews('wiki-manual-candidate')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

const discoverWithAi = async() => {
  if (discovering.value || loading.value) return
  discovering.value = true
  globalError.value = ''
  try {
    await invoke('tauri_knowledge_wiki_semantic_discover', { limit: 12 })
    await loadLibrary()
    await refreshKnowledgeViews('wiki-semantic-discovery')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    discovering.value = false
  }
}

const analyseNotes = async() => {
  if (runtimeUnavailable.value || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    await globalThis.elephantnote?.knowledge?.rebuild?.()
    const result = await runtime.value.libraryList({ limit: 500 })
    entries.value = Array.isArray(result) ? result : []
    await refreshKnowledgeViews('wiki-analysis')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

const handleCardClick = (entry) => {
  if (entry.kind === 'suggestion') {
    selectedSuggestionId.value = selectedSuggestionId.value === entry.id ? '' : entry.id
    return
  }
  if (entry.status === 'draft') return
  openWiki(entry)
}

const generateSuggestion = async(entry) => {
  if (isBusy(entry.id)) return
  setBusy(entry.id, true)
  setEntryError(entry.id)
  globalError.value = ''
  try {
    const aiConfig = await globalThis.elephantnote?.ai?.getConfig?.() || {}
    await runtime.value.libraryGenerate({
      topic: entry.topic,
      title: entry.title,
      sourcePaths: entry.sourcePaths || [],
      payload: { aiConfig }
    })
    selectedSuggestionId.value = ''
    await loadLibrary()
    await refreshKnowledgeViews('wiki-generated')
  } catch (error) {
    setEntryError(entry.id, normalizeError(error))
  } finally {
    setBusy(entry.id, false)
  }
}

const rejectSuggestion = async(entry) => {
  if (isBusy(entry.id)) return
  setBusy(entry.id, true)
  setEntryError(entry.id)
  try {
    await runtime.value.libraryReject(entry.topic)
    entries.value = entries.value.filter((item) => item.id !== entry.id)
    selectedSuggestionId.value = ''
    await refreshKnowledgeViews('wiki-suggestion-rejected')
  } catch (error) {
    setEntryError(entry.id, normalizeError(error))
  } finally {
    setBusy(entry.id, false)
  }
}

const publishDraft = async(entry) => {
  if (!entry.draftId || isBusy(entry.id)) return
  setBusy(entry.id, true)
  setEntryError(entry.id)
  try {
    await runtime.value.accept(entry.draftId)
    await loadLibrary()
    await refreshKnowledgeViews('wiki-published')
  } catch (error) {
    setEntryError(entry.id, normalizeError(error))
  } finally {
    setBusy(entry.id, false)
  }
}

const openWiki = (entry) => {
  if (!entry.path) return
  openMenuId.value = ''
  store.openNote({
    path: entry.path,
    title: entry.title,
    kind: 'note',
    type: 'note',
    updatedAt: entry.updatedAt ? new Date(Number(entry.updatedAt) * 1000).toISOString() : new Date().toISOString()
  })
}

const deleteWiki = async(entry) => {
  if (!entry.draftId || isBusy(entry.id)) return
  if (deleteConfirmId.value !== entry.id) {
    deleteConfirmId.value = entry.id
    openMenuId.value = entry.id
    return
  }
  deleteConfirmId.value = ''
  openMenuId.value = ''
  setBusy(entry.id, true)
  setEntryError(entry.id)
  try {
    await runtime.value.libraryDelete(entry.draftId, true)
    entries.value = entries.value.filter((item) => item.id !== entry.id)
    await refreshKnowledgeViews('wiki-deleted')
  } catch (error) {
    setEntryError(entry.id, normalizeError(error))
  } finally {
    setBusy(entry.id, false)
  }
}

const toggleMenu = (id) => {
  deleteConfirmId.value = ''
  openMenuId.value = openMenuId.value === id ? '' : id
}

const closeMenu = (event) => {
  if (!openMenuId.value) return
  if (event?.target?.closest?.('.en-card-popover, .en-card-menu')) return
  deleteConfirmId.value = ''
  openMenuId.value = ''
}

const formatDate = (timestamp) => {
  const value = Number(timestamp || 0)
  if (!value) return 'Wiki généré'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value * 1000))
}

onMounted(() => {
  window.addEventListener('click', closeMenu)
  void loadLibrary()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.en-wiki-library {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-wiki-toolbar {
  min-height: 112px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 34px;
}

.en-wiki-heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.en-wiki-heading h1 {
  margin: 0;
  font-size: 30px;
}

.en-wiki-heading span {
  color: var(--en-muted);
  font-size: 15px;
}

.en-wiki-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.en-toolbar-button,
.en-select,
.en-view-toggle {
  height: 52px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-surface) 52%, transparent);
  font: inherit;
  font-size: 16px;
}

.en-toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 16px;
}

.en-toolbar-button:disabled {
  opacity: .55;
}

.en-select {
  min-width: 230px;
  padding: 0 18px;
}

.en-view-toggle {
  display: inline-flex;
  overflow: hidden;
}

.en-view-toggle button {
  width: 56px;
  border: 0;
  color: var(--en-muted);
  background: transparent;
}

.en-view-toggle button.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-wiki-message {
  margin: 0 34px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 12px 14px;
}

.en-wiki-message.error,
.en-card-error {
  color: var(--en-danger, #ef4444);
  background: color-mix(in srgb, var(--en-danger, #ef4444) 8%, transparent);
}

.en-wiki-message button {
  margin-left: auto;
  border: 0;
  color: inherit;
  background: transparent;
}

.en-wiki-grid {
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
  padding: 20px;
  align-content: start;
}

.en-wiki-grid.list {
  grid-template-columns: 1fr;
}

.en-wiki-grid.empty {
  display: block;
  padding: 0;
}

.en-wiki-empty {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--en-muted);
  text-align: center;
}

.en-wiki-empty strong {
  color: var(--en-text);
  font-size: 18px;
}

.en-empty-icon {
  width: 34px;
  height: 34px;
}

.en-wiki-card {
  position: relative;
  min-height: 208px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 22px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-surface) 34%, var(--en-bg));
  overflow: hidden;
  cursor: pointer;
  contain: layout paint style;
  content-visibility: auto;
  contain-intrinsic-size: 208px 360px;
}

.en-wiki-card:hover,
.en-wiki-card.selected {
  border-color: var(--en-border-strong);
}

.en-wiki-card.suggestion {
  opacity: .74;
  border-style: dashed;
  background: color-mix(in srgb, var(--en-primary) 5%, var(--en-bg));
}

.en-wiki-card.suggestion:hover,
.en-wiki-card.suggestion.selected {
  opacity: 1;
}

.en-wiki-card.outdated {
  border-color: color-mix(in srgb, #f59e0b 55%, var(--en-border));
}

.en-wiki-card.busy {
  pointer-events: none;
}

.en-card-actions {
  position: absolute;
  top: 18px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.en-card-menu {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--en-muted);
  background: transparent;
}

.en-status {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
}

.en-status.suggested {
  color: var(--en-primary);
}

.en-status.outdated {
  color: #f59e0b;
}

.en-status.draft {
  color: var(--en-muted);
}

.en-card-popover {
  position: absolute;
  top: 54px;
  right: 18px;
  z-index: 5;
  min-width: 170px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--en-surface);
}

.en-card-popover button {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  color: var(--en-text);
  background: transparent;
  text-align: left;
}

.en-card-popover button.danger {
  color: var(--en-danger, #ef4444);
}

.en-popover-icon {
  width: 16px;
  height: 16px;
}

.en-wiki-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 62px;
}

.en-wiki-title-row h2 {
  min-width: 0;
  margin: 0;
  font-size: clamp(19px, 1.35vw, 24px);
  line-height: 1.12;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.en-document-icon {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  margin-top: 3px;
}

.en-wiki-excerpt {
  flex: 1;
  margin: 18px 0 12px;
  color: var(--en-muted);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.en-wiki-preview {
  display: grid;
  gap: 10px;
  margin: 0 0 14px;
  border-top: 1px solid var(--en-border);
  border-bottom: 1px solid var(--en-border);
  padding: 12px 0;
  color: var(--en-text);
}

.en-wiki-preview > p {
  margin: 0;
  color: var(--en-muted);
  line-height: 1.45;
}

.en-wiki-preview-section {
  display: grid;
  gap: 4px;
}

.en-wiki-preview-section > span {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.en-wiki-preview-section ul {
  margin: 0;
  padding-left: 18px;
  color: var(--en-muted);
  font-size: 13px;
}

.en-wiki-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.en-wiki-meta span {
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--en-muted);
  background: var(--en-soft);
  font-size: 12px;
}

.en-card-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  padding: 9px;
  font-size: 13px;
}

.en-suggestion-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 9px;
  margin-top: 12px;
}

.en-suggestion-actions button,
.en-wiki-footer button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-soft);
}

.en-suggestion-actions button.primary {
  border-color: var(--en-primary);
  color: white;
  background: var(--en-primary);
}

.en-button-icon {
  width: 16px;
  height: 16px;
}

.en-wiki-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--en-muted);
  font-size: 13px;
}

.en-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--en-primary);
}

.en-edit-hint {
  margin-left: auto;
}

.en-wiki-footer button {
  min-height: 30px;
  margin-left: auto;
}

.en-icon {
  width: 20px;
  height: 20px;
}

.spinning {
  animation: en-wiki-spin 1s linear infinite;
}

@keyframes en-wiki-spin {
  to { transform: rotate(360deg); }
}

.en-wiki-topic-entry { display: flex; align-items: center; gap: 8px; min-width: min(360px, 34vw); }
.en-wiki-topic-entry input { min-width: 0; flex: 1; height: 40px; padding: 0 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-surface); color: var(--en-text); }
.en-wiki-topic-entry button { height: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); color: var(--en-text); }

@media (max-width: 900px) {
  .en-wiki-toolbar {
    min-height: auto;
    align-items: flex-start;
    flex-direction: column;
    padding: 20px;
  }

  .en-wiki-toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .en-select {
    min-width: 180px;
    flex: 1;
  }

  .en-wiki-grid {
    grid-template-columns: 1fr;
    padding: 14px;
  }
}
</style>

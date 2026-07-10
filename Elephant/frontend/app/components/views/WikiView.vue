<template>
  <section class="knowledge-wiki-view">
    <header class="knowledge-wiki-header">
      <div>
        <p class="knowledge-wiki-eyebrow">
          Knowledge core
        </p>
        <h1>Wikis</h1>
        <p class="knowledge-wiki-subtitle">
          Synthèses générées depuis les notes originales, avec citations vérifiables.
        </p>
      </div>
      <button
        class="knowledge-button knowledge-button-secondary"
        type="button"
        :disabled="busy"
        @click="refresh"
      >
        Actualiser
      </button>
    </header>

    <div
      v-if="runtimeUnavailable"
      class="knowledge-notice knowledge-notice-error"
    >
      Le moteur Rust de connaissances n’est pas disponible dans ce runtime.
    </div>

    <div
      v-else
      class="knowledge-wiki-layout"
    >
      <aside class="knowledge-wiki-sidebar">
        <section class="knowledge-wiki-generator">
          <div class="knowledge-section-heading">
            <h2>Propositions automatiques</h2>
            <span>{{ candidates.length }} sujet{{ candidates.length === 1 ? '' : 's' }} détecté{{ candidates.length === 1 ? '' : 's' }}</span>
          </div>
          <p class="knowledge-auto-copy">
            ElephantNote détecte des groupes de notes cohérents et prépare des brouillons cités. Les notes originales ne sont jamais modifiées.
          </p>
          <button
            class="knowledge-button knowledge-button-primary"
            type="button"
            :disabled="busy || autoProposing"
            @click="runAutoProposals(true)"
          >
            {{ autoProposing ? 'Analyse et génération…' : 'Analyser maintenant' }}
          </button>
          <div v-if="candidates.length" class="knowledge-candidate-list">
            <article
              v-for="candidate in candidates.slice(0, 6)"
              :key="candidate.topic"
              class="knowledge-candidate"
            >
              <strong>{{ candidate.title }}</strong>
              <span>{{ candidate.reason }}</span>
              <small>{{ candidate.sourcePaths.length }} notes sources</small>
            </article>
          </div>
        </section>

        <nav
          class="knowledge-wiki-tabs"
          aria-label="États des wikis"
        >
          <button
            v-for="tab in tabs"
            :key="tab.status"
            type="button"
            :class="['knowledge-wiki-tab', { active: activeStatus === tab.status }]"
            @click="selectStatus(tab.status)"
          >
            <span>{{ tab.label }}</span>
            <strong>{{ counts[tab.status] || 0 }}</strong>
          </button>
        </nav>
      </aside>

      <main class="knowledge-wiki-main">
        <div
          v-if="error"
          class="knowledge-notice knowledge-notice-error"
        >
          {{ error }}
        </div>
        <div
          v-if="message"
          class="knowledge-notice knowledge-notice-success"
        >
          {{ message }}
        </div>

        <div
          v-if="loading"
          class="knowledge-empty-state"
        >
          Chargement des wikis…
        </div>

        <div
          v-else-if="!filteredDrafts.length"
          class="knowledge-empty-state"
        >
          <strong>Aucun wiki {{ activeTabLabel.toLowerCase() }}</strong>
          <span>Les notes originales ne sont jamais modifiées par cette vue.</span>
        </div>

        <template v-else>
          <article
            v-for="draft in filteredDrafts"
            :key="draft.id"
            :class="['knowledge-wiki-card', { selected: selectedDraft?.id === draft.id }]"
          >
            <button
              class="knowledge-wiki-card-header"
              type="button"
              @click="toggleDraft(draft)"
            >
              <div>
                <div class="knowledge-wiki-card-title-row">
                  <h2>{{ draft.title }}</h2>
                  <span :class="['knowledge-status', `status-${draft.status}`]">
                    {{ statusLabel(draft.status) }}
                  </span>
                </div>
                <p>{{ draft.topic }}</p>
              </div>
              <span class="knowledge-wiki-chevron">
                {{ selectedDraft?.id === draft.id ? '−' : '+' }}
              </span>
            </button>

            <div class="knowledge-wiki-meta">
              <span>{{ draft.sourcePaths?.length || 0 }} notes</span>
              <span>{{ draft.citations?.length || 0 }} citations</span>
              <span>{{ draft.modelId || 'modèle inconnu' }}</span>
              <span>{{ formatDate(draft.updatedAt) }}</span>
            </div>

            <div
              v-if="selectedDraft?.id === draft.id"
              class="knowledge-wiki-details"
            >
              <section class="knowledge-source-section">
                <h3>Sources</h3>
                <div class="knowledge-source-list">
                  <button
                    v-for="source in uniqueSources(draft)"
                    :key="source"
                    type="button"
                    class="knowledge-source-chip"
                    @click="openSource(source)"
                  >
                    {{ source }}
                  </button>
                </div>
              </section>

              <section class="knowledge-citation-section">
                <h3>Citations</h3>
                <div class="knowledge-citation-list">
                  <button
                    v-for="citation in draft.citations || []"
                    :key="citation.key"
                    type="button"
                    class="knowledge-citation-row"
                    @click="openCitation(citation)"
                  >
                    <strong>{{ citation.key }}</strong>
                    <span>{{ citation.documentTitle }} — {{ citation.heading }}</span>
                    <small>octets {{ citation.startOffset }}–{{ citation.endOffset }}</small>
                  </button>
                </div>
              </section>

              <section class="knowledge-markdown-section">
                <div class="knowledge-section-heading">
                  <h3>Aperçu Muya</h3>
                  <span>{{ draft.slug }}.md</span>
                </div>
                <div
                  class="knowledge-muya-preview"
                  v-html="renderedWikiHtml[draft.id] || ''"
                />
              </section>

              <footer class="knowledge-wiki-actions">
                <button
                  v-if="draft.status === 'proposed' || draft.status === 'outdated'"
                  class="knowledge-button knowledge-button-primary"
                  type="button"
                  :disabled="busy"
                  @click="acceptDraft(draft)"
                >
                  {{ draft.status === 'outdated' ? 'Accepter la nouvelle version' : 'Accepter le wiki' }}
                </button>
                <button
                  v-if="draft.status === 'proposed' || draft.status === 'outdated'"
                  class="knowledge-button knowledge-button-danger"
                  type="button"
                  :disabled="busy"
                  @click="rejectDraft(draft)"
                >
                  Rejeter
                </button>
              </footer>
            </div>
          </article>
        </template>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const tabs = Object.freeze([
  { status: 'proposed', label: 'Propositions' },
  { status: 'accepted', label: 'Acceptés' },
  { status: 'outdated', label: 'À actualiser' },
  { status: 'rejected', label: 'Rejetés' }
])

const drafts = ref([])
const renderedWikiHtml = reactive({})
const activeStatus = ref('proposed')
const selectedDraft = ref(null)
const loading = ref(false)
const candidates = ref([])
const discovering = ref(false)
const autoProposing = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')

const runtime = computed(() => globalThis.elephantnote?.knowledge)
const runtimeUnavailable = computed(() => !runtime.value?.wikis)
const counts = computed(() => drafts.value.reduce((output, draft) => {
  output[draft.status] = (output[draft.status] || 0) + 1
  return output
}, {}))
const filteredDrafts = computed(() => drafts.value.filter((draft) => draft.status === activeStatus.value))
const activeTabLabel = computed(() => tabs.find((tab) => tab.status === activeStatus.value)?.label || '')

const normalizeError = (value) => value?.message || String(value || 'Erreur inconnue')

const renderDraftWithMuya = async (draft) => {
  const result = await globalThis.elephantnote?.muya?.renderHtml?.({ markdown: draft.markdown || '' })
  renderedWikiHtml[draft.id] = result?.html || ''
}

const refresh = async () => {
  if (runtimeUnavailable.value) return
  loading.value = true
  error.value = ''
  try {
    drafts.value = await runtime.value.wikis.list({ limit: 500 })
    await Promise.all(drafts.value.map(renderDraftWithMuya))
    if (selectedDraft.value) {
      selectedDraft.value = drafts.value.find((draft) => draft.id === selectedDraft.value.id) || null
    }
  } catch (reason) {
    error.value = normalizeError(reason)
  } finally {
    loading.value = false
  }
}

const loadCandidates = async () => {
  if (runtimeUnavailable.value) return
  discovering.value = true
  try {
    candidates.value = await runtime.value.wikis.candidates({ limit: 12 })
  } catch (reason) {
    error.value = normalizeError(reason)
  } finally {
    discovering.value = false
  }
}

const runAutoProposals = async (force = false) => {
  if (runtimeUnavailable.value || autoProposing.value) return
  autoProposing.value = true
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const aiConfig = await globalThis.elephantnote?.ai?.getConfig?.() || {}
    const result = await runtime.value.wikis.autoPropose({
      payload: { aiConfig, modelSelection: aiConfig.localModelSelection || {} },
      maxProposals: 2,
      force
    })
    const count = result.generated?.length || 0
    if (count) {
      message.value = `${count} proposition${count === 1 ? '' : 's'} de wiki prête${count === 1 ? '' : 's'} à être relue${count === 1 ? '' : 's'}.`
      activeStatus.value = 'proposed'
    } else if (result.errors?.length) {
      error.value = result.errors[0]
    } else if (!result.alreadyRan) {
      message.value = 'Aucun nouveau groupe de notes suffisamment cohérent pour proposer un wiki.'
    }
    await refresh()
    await loadCandidates()
  } catch (reason) {
    error.value = normalizeError(reason)
  } finally {
    autoProposing.value = false
    busy.value = false
  }
}

const initializeWiki = async () => {
  await refresh()
  await loadCandidates()
  const hasPending = drafts.value.some((draft) => draft.status === 'proposed')
  if (!hasPending && candidates.value.length) await runAutoProposals(false)
}

const acceptDraft = async (draft) => {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const accepted = await runtime.value.wikis.accept(draft.id)
    message.value = `Le wiki « ${accepted.title} » a été écrit dans .elephantnote/wiki/.`
    await refresh()
  } catch (reason) {
    error.value = normalizeError(reason)
  } finally {
    busy.value = false
  }
}

const rejectDraft = async (draft) => {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await runtime.value.wikis.reject(draft.id)
    message.value = `La proposition « ${draft.title} » a été rejetée.`
    selectedDraft.value = null
    await refresh()
  } catch (reason) {
    error.value = normalizeError(reason)
  } finally {
    busy.value = false
  }
}

const selectStatus = (status) => {
  activeStatus.value = status
  selectedDraft.value = null
  error.value = ''
  message.value = ''
}

const toggleDraft = (draft) => {
  selectedDraft.value = selectedDraft.value?.id === draft.id ? null : draft
}

const uniqueSources = (draft) => [...new Set(draft.sourcePaths || [])]
const statusLabel = (status) => ({
  proposed: 'Proposé',
  accepted: 'Accepté',
  outdated: 'À actualiser',
  rejected: 'Rejeté'
})[status] || status
const formatDate = (value) => {
  const timestamp = Number(value || 0) * 1000
  return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : ''
}

const openSource = async (relativePath) => {
  try {
    await globalThis.elephantnote?.notes?.open?.(relativePath)
  } catch (reason) {
    error.value = normalizeError(reason)
  }
}

const openCitation = async (citation) => {
  try {
    if (globalThis.elephantnote?.notes?.openAtOffset) {
      await globalThis.elephantnote.notes.openAtOffset(
        citation.documentPath,
        citation.startOffset,
        citation.endOffset
      )
      return
    }
    await openSource(citation.documentPath)
  } catch (reason) {
    error.value = normalizeError(reason)
  }
}

onMounted(initializeWiki)
</script>

<style scoped>
.knowledge-wiki-view {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 28px;
  color: var(--editorColor, #202124);
  background: var(--editorBgColor, #fff);
}

.knowledge-wiki-header,
.knowledge-section-heading,
.knowledge-wiki-card-title-row,
.knowledge-wiki-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.knowledge-wiki-header {
  margin: 0 auto 24px;
  max-width: 1420px;
}

.knowledge-wiki-header h1,
.knowledge-wiki-card h2,
.knowledge-wiki-generator h2,
.knowledge-wiki-details h3 {
  margin: 0;
}

.knowledge-wiki-eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  opacity: .58;
}

.knowledge-wiki-subtitle {
  margin: 6px 0 0;
  opacity: .68;
}

.knowledge-wiki-layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 24px;
  max-width: 1420px;
  margin: 0 auto;
}

.knowledge-wiki-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.knowledge-wiki-generator,
.knowledge-wiki-tabs,
.knowledge-wiki-card,
.knowledge-notice,
.knowledge-empty-state {
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--editorBgColor, #fff) 94%, currentColor 6%);
}

.knowledge-wiki-generator {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.knowledge-auto-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: .72;
}

.knowledge-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.knowledge-candidate {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--editorBgColor, #fff) 97%, currentColor 3%);
}

.knowledge-candidate span,
.knowledge-candidate small {
  font-size: 12px;
  opacity: .64;
}

.knowledge-section-heading span,
.knowledge-field small {
  font-size: 12px;
  opacity: .55;
}

.knowledge-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}

.knowledge-field input,
.knowledge-field textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 9px;
  padding: 10px 11px;
  color: inherit;
  background: var(--editorBgColor, #fff);
  font: inherit;
  font-weight: 400;
  resize: vertical;
}

.knowledge-button {
  border: 0;
  border-radius: 9px;
  padding: 9px 13px;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.knowledge-button:disabled {
  cursor: not-allowed;
  opacity: .48;
}

.knowledge-button-primary {
  color: #fff;
  background: var(--themeColor, #4f6ef7);
}

.knowledge-button-secondary {
  color: inherit;
  background: color-mix(in srgb, currentColor 9%, transparent);
}

.knowledge-button-danger {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 10%, transparent);
}

.knowledge-wiki-tabs {
  overflow: hidden;
}

.knowledge-wiki-tab {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding: 12px 14px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.knowledge-wiki-tab:last-child {
  border-bottom: 0;
}

.knowledge-wiki-tab.active {
  color: var(--themeColor, #4f6ef7);
  background: color-mix(in srgb, var(--themeColor, #4f6ef7) 10%, transparent);
}

.knowledge-wiki-tab strong {
  min-width: 24px;
  border-radius: 999px;
  padding: 2px 7px;
  text-align: center;
  background: color-mix(in srgb, currentColor 9%, transparent);
}

.knowledge-wiki-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.knowledge-notice,
.knowledge-empty-state {
  padding: 16px;
}

.knowledge-notice-error {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 8%, var(--editorBgColor, #fff));
}

.knowledge-notice-success {
  color: #176b3a;
  background: color-mix(in srgb, #176b3a 8%, var(--editorBgColor, #fff));
}

.knowledge-empty-state {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  text-align: center;
  opacity: .68;
}

.knowledge-wiki-card {
  overflow: hidden;
}

.knowledge-wiki-card.selected {
  border-color: color-mix(in srgb, var(--themeColor, #4f6ef7) 55%, transparent);
}

.knowledge-wiki-card-header {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  border: 0;
  padding: 18px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.knowledge-wiki-card-header p {
  margin: 5px 0 0;
  opacity: .65;
}

.knowledge-wiki-chevron {
  font-size: 24px;
  font-weight: 300;
  opacity: .55;
}

.knowledge-status {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
}

.status-proposed {
  color: #3156d3;
  background: color-mix(in srgb, #3156d3 12%, transparent);
}

.status-accepted {
  color: #176b3a;
  background: color-mix(in srgb, #176b3a 12%, transparent);
}

.status-outdated {
  color: #8a4b08;
  background: color-mix(in srgb, #d97706 15%, transparent);
}

.status-rejected {
  color: #8b1d17;
  background: color-mix(in srgb, #b3261e 10%, transparent);
}

.knowledge-wiki-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  border-top: 1px solid color-mix(in srgb, currentColor 9%, transparent);
  padding: 10px 18px;
  font-size: 12px;
  opacity: .62;
}

.knowledge-wiki-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
  border-top: 1px solid color-mix(in srgb, currentColor 9%, transparent);
  padding: 18px;
}

.knowledge-source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.knowledge-source-chip,
.knowledge-citation-row {
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  color: inherit;
  background: color-mix(in srgb, currentColor 5%, transparent);
  cursor: pointer;
}

.knowledge-source-chip {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
}

.knowledge-citation-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.knowledge-citation-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border-radius: 8px;
  padding: 9px 10px;
  text-align: left;
}

.knowledge-citation-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-citation-row small {
  opacity: .55;
}

.knowledge-muya-preview {
  max-height: 520px;
  overflow: auto;
  border-radius: 10px;
  margin: 10px 0 0;
  padding: 15px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
  background: color-mix(in srgb, currentColor 7%, transparent);
}

.knowledge-wiki-actions {
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .knowledge-wiki-view {
    padding: 16px;
  }

  .knowledge-wiki-layout {
    grid-template-columns: 1fr;
  }

  .knowledge-wiki-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .knowledge-wiki-tab:nth-child(odd) {
    border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  .knowledge-citation-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .knowledge-citation-row small {
    grid-column: 2;
  }
}
</style>

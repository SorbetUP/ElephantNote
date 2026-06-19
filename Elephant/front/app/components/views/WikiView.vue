<template>
  <section class="en-wiki-workspace">
    <header class="en-wiki-hero">
      <div class="en-wiki-hero-copy">
        <p class="en-wiki-kicker">Atomic-style wiki</p>
        <h1>Graph-backed synthesis</h1>
        <p>
          Wiki pages are proposed from the semantic graph, citations stay clickable, and source
          inspection is resolved from the backend.
        </p>
      </div>

      <div class="en-wiki-hero-actions">
        <button
          type="button"
          :disabled="store.wikiLoading"
          @click="store.loadWiki({ regenerate: true })"
        >
          {{ store.wikiLoading ? 'Synthesizing...' : 'Propose pages' }}
        </button>
        <button
          type="button"
          @click="searchStore.inspect()"
        >
          Refresh graph
        </button>
      </div>
    </header>

    <section class="en-wiki-graph-panel">
      <div class="en-wiki-graph-panel-head">
        <div>
          <p class="en-wiki-kicker">Inspection</p>
          <h2>Semantic graph first</h2>
        </div>
        <span class="en-wiki-status">{{ graphSummary.semanticEdges }} semantic links</span>
      </div>

      <div class="en-wiki-graph-metrics">
        <span><strong>{{ graphSummary.nodes }}</strong> graph nodes</span>
        <span><strong>{{ graphSummary.semanticEdges }}</strong> semantic links</span>
        <span><strong>{{ graphSummary.structureEdges }}</strong> structure links</span>
        <span><strong>{{ graphSummary.clusters }}</strong> clusters</span>
        <span><strong>{{ graphSummary.sources }}</strong> cited sources</span>
      </div>

      <div
        v-if="graphClusters.length"
        class="en-wiki-cluster-strip"
      >
        <button
          v-for="cluster in graphClusters"
          :key="cluster.id"
          type="button"
          class="en-wiki-cluster-chip"
          @click="focusCluster(cluster)"
        >
          {{ cluster.label }} · {{ cluster.nodeCount }}
        </button>
      </div>

      <p class="en-wiki-graph-note">
        The backend now synthesizes wiki proposals from graph clusters and source-rich notes.
      </p>
    </section>

    <div class="en-wiki-layout">
      <section class="en-wiki-list">
        <article
          v-for="record in records"
          :key="record.id"
          :class="{ selected: selectedRecord?.id === record.id }"
          @click="selectRecord(record)"
        >
          <header>
            <div>
              <h2>{{ record.title || record.topic }}</h2>
              <p>{{ record.status }} · {{ record.citations.length }} citations</p>
            </div>
            <button
              v-if="record.notePath"
              type="button"
              class="en-wiki-open-page"
              @click.stop="openPage(record)"
            >
              Open
            </button>
          </header>

          <p class="en-wiki-summary">
            {{ record.summary }}
          </p>

          <div
            v-if="record.citations.length"
            class="en-wiki-citations"
          >
            <button
              v-for="citation in record.citations.slice(0, 6)"
              :key="citation.path"
              type="button"
              class="en-wiki-citation"
              @click.stop="inspectSource(record, citation)"
            >
              {{ citation.title }}
            </button>
          </div>

          <footer class="en-wiki-actions">
            <button
              v-if="record.status === 'proposed'"
              type="button"
              @click.stop="store.acceptWikiProposal(record.id)"
            >
              Accept
            </button>
            <button
              v-if="record.status === 'proposed'"
              type="button"
              @click.stop="store.dismissWikiProposal(record.id)"
            >
              Dismiss
            </button>
          </footer>
        </article>

        <article
          v-if="!records.length"
          class="en-wiki-empty-card"
        >
          <h2>No wiki proposals yet</h2>
          <p>
            Build the semantic index and regenerate proposals to generate graph-backed wiki pages.
          </p>
        </article>
      </section>

      <aside class="en-wiki-detail">
        <template v-if="selectedRecord">
          <div class="en-wiki-detail-head">
            <div>
              <p class="en-wiki-kicker">Selected topic</p>
              <h2>{{ selectedRecord.title || selectedRecord.topic }}</h2>
              <p>{{ selectedRecord.summary }}</p>
              <div class="en-wiki-detail-meta">
                <span>{{ selectedRecord.status }}</span>
                <span>{{ selectedRecord.citations.length }} citations</span>
                <span v-if="sourceInsight?.cluster">{{ sourceInsight.cluster.label }}</span>
              </div>
            </div>
            <span class="en-wiki-status">{{ selectedRecord.status }}</span>
          </div>

          <section class="en-wiki-source-section">
            <h3>Sources</h3>
            <div
              v-if="selectedRecord.citations.length"
              class="en-wiki-source-list"
            >
              <button
                v-for="citation in selectedRecord.citations"
                :key="citation.path"
                type="button"
                class="en-wiki-source-pill"
                :class="{ active: selectedCitation?.path === citation.path }"
                @click="inspectSource(selectedRecord, citation)"
              >
                {{ citation.title }}
              </button>
            </div>
          </section>

          <section
            v-if="sourceInsight"
            class="en-wiki-source-card"
          >
            <div class="en-wiki-source-card-head">
              <div>
                <p class="en-wiki-kicker">Source focus</p>
                <h3>{{ sourceInsight.source?.title || selectedCitation?.title || 'Source' }}</h3>
              </div>
              <button
                type="button"
                @click="openSelectedSource"
              >
                Open note
              </button>
            </div>

            <p class="en-wiki-source-summary">
              {{ sourceInsight.source?.summary || selectedCitation?.excerpt || 'No source summary yet.' }}
            </p>

            <div class="en-wiki-source-meta">
              <span>{{ sourceInsight.source?.kind || 'note' }}</span>
              <span>{{ sourceInsight.source?.sourceCount || 0 }} sources</span>
              <span>{{ sourceInsight.source?.chunkCount || 0 }} chunks</span>
              <span v-if="sourceInsight.cluster">{{ sourceInsight.cluster.label }}</span>
            </div>

            <section
              v-if="sourceInsight.relatedNodes.length"
              class="en-wiki-related-section"
            >
              <h4>Connected notes</h4>
              <div class="en-wiki-related-grid">
                <button
                  v-for="node in sourceInsight.relatedNodes"
                  :key="node.id"
                  type="button"
                  class="en-wiki-related-card"
                  @click="openNote(node.id)"
                >
                  <strong>{{ node.title }}</strong>
                  <span>{{ node.linkType }}</span>
                </button>
              </div>
            </section>
          </section>

          <section
            v-if="selectedCitation"
            class="en-wiki-citation-detail"
          >
            <p class="en-wiki-kicker">Citation detail</p>
            <h3>{{ selectedCitation.title }}</h3>
            <p>{{ selectedCitation.excerpt || 'No excerpt available.' }}</p>
            <button
              type="button"
              @click="openNote(selectedCitation.path)"
            >
              Open citation note
            </button>
          </section>
        </template>

        <template v-else>
          <h2>Select a proposal</h2>
          <p>Choose a wiki proposal to inspect its citations and the graph-connected source notes.</p>
        </template>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  buildWikiGraphPanel,
  buildWikiRecordCard,
  buildWikiSourceCard
} from './wikiViewHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()

const selectedRecord = ref(null)
const selectedCitation = ref(null)
const sourceInsight = ref(null)
const graphPanel = computed(() => buildWikiGraphPanel({
  inspectionGraph: searchStore.indexInspection?.graph,
  includeStructure: false
}))
const graphClusters = computed(() => graphPanel.value.clusters)

const records = computed(() => store.wikiProposals.length
  ? store.wikiProposals.map((record) => buildWikiRecordCard(record))
  : [])

const graphSummary = computed(() => graphPanel.value.summary)
const selectedSourceCard = computed(() => buildWikiSourceCard({
  selectedRecord: selectedRecord.value,
  selectedCitation: selectedCitation.value,
  sourceInsight: sourceInsight.value
}))

const openNote = (value) => {
  const notePath = typeof value === 'string' ? value : value?.path || value?.relativePath || ''
  if (!notePath) return
  const note = [...store.entries, ...store.rootEntries, ...store.openedNotes]
    .find((entry) => entry?.path === notePath)
  if (note) {
    store.openNote(note)
    return
  }
  store.openNote({
    kind: 'note',
    type: 'note',
    path: notePath,
    title: notePath.split('/').pop()?.replace(/\.md$/i, '') || notePath
  })
}

const openPage = (record) => {
  if (!record?.notePath) return
  openNote(record.notePath)
}

const selectRecord = (record) => {
  selectedRecord.value = record
  selectedCitation.value = record?.citations?.[0] || null
  sourceInsight.value = null
  if (selectedCitation.value) {
    inspectSource(record, selectedCitation.value)
  }
}

const inspectSource = async (record, citation) => {
  if (!citation?.path) return
  selectedRecord.value = record || selectedRecord.value
  selectedCitation.value = citation
  try {
    sourceInsight.value = await elephantnoteClient.wiki.sourceInfo(citation.path)
  } catch {
    sourceInsight.value = {
      source: {
        path: citation.path,
        title: citation.title || citation.path,
        summary: citation.excerpt || '',
        kind: 'note',
        sourceCount: 0,
        chunkCount: 0
      },
      relatedNodes: [],
      cluster: null
    }
  }
}

const openSelectedSource = () => {
  const sourcePath = selectedSourceCard.value.source?.path || selectedCitation.value?.path
  if (sourcePath) openNote(sourcePath)
}

const focusCluster = (cluster) => {
  if (!cluster?.paths?.length) return
  const firstPath = cluster.paths[0]
  if (!firstPath) return
  const record = records.value.find((item) => item.citations?.some((citation) => citation.path === firstPath))
  if (record) {
    selectRecord(record)
    return
  }
  openNote(firstPath)
}

onMounted(() => {
  searchStore.inspect().catch(() => {})
  store.loadWiki().catch(() => {})
})

watch(() => store.activeVaultId, () => {
  searchStore.inspect().catch(() => {})
  store.loadWiki().catch(() => {})
  selectedRecord.value = null
  selectedCitation.value = null
  sourceInsight.value = null
})
</script>

<style scoped>
.en-wiki-workspace {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 24px 24px;
  overflow: auto;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 32%),
    radial-gradient(circle at bottom right, rgba(15, 23, 42, 0.06), transparent 36%),
    var(--en-bg);
}

.en-wiki-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--en-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--en-surface) 92%, transparent);
  box-shadow: 0 18px 50px color-mix(in srgb, #020617 12%, transparent);
}

.en-wiki-hero-copy h1,
.en-wiki-hero-copy p {
  margin: 0;
}

.en-wiki-kicker {
  margin-bottom: 8px !important;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}

.en-wiki-hero-copy h1 {
  font-size: 30px;
  line-height: 1.05;
}

.en-wiki-hero-copy p:last-child {
  margin-top: 10px;
  max-width: 760px;
  color: var(--en-muted);
}

.en-wiki-hero-actions {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.en-wiki-hero-actions button,
.en-wiki-source-card button,
.en-wiki-citation-detail button,
.en-wiki-list button,
.en-wiki-cluster-chip {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  min-height: 36px;
  padding: 0 14px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-wiki-graph-panel {
  display: grid;
  gap: 12px;
  padding: 14px 18px;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--en-surface) 90%, transparent);
}

.en-wiki-graph-panel-head,
.en-wiki-detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.en-wiki-graph-panel-head h2 {
  margin: 0;
  font-size: 18px;
}

.en-wiki-graph-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.en-wiki-graph-metrics span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--en-border);
  color: var(--en-muted);
  background: var(--en-bg);
}

.en-wiki-graph-metrics strong {
  color: var(--en-text);
}

.en-wiki-cluster-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-wiki-cluster-chip {
  background: color-mix(in srgb, var(--en-soft) 55%, var(--en-bg));
}

.en-wiki-graph-note {
  margin: 0;
  color: var(--en-muted);
}

.en-wiki-detail-meta {
  margin-top: 10px;
  justify-content: flex-start;
  color: var(--en-muted);
  font-size: 12px;
}

.en-wiki-detail-meta span {
  padding: 5px 9px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  background: var(--en-bg);
}

.en-wiki-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
  gap: 16px;
}

.en-wiki-list {
  min-height: 0;
  display: grid;
  gap: 14px;
  overflow: auto;
}

.en-wiki-list article,
.en-wiki-detail {
  border: 1px solid var(--en-border);
  border-radius: 24px;
  padding: 18px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
  box-shadow: 0 18px 60px color-mix(in srgb, #020617 10%, transparent);
}

.en-wiki-empty-card h2 {
  margin: 0;
}

.en-wiki-empty-card p {
  margin-top: 8px;
  color: var(--en-muted);
}

.en-wiki-list article.selected {
  border-color: color-mix(in srgb, var(--en-primary) 35%, var(--en-border));
  box-shadow: 0 20px 70px color-mix(in srgb, var(--en-primary) 12%, transparent);
}

.en-wiki-list article header,
.en-wiki-detail-head,
.en-wiki-source-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.en-wiki-list h2,
.en-wiki-detail h2,
.en-wiki-source-card h3,
.en-wiki-citation-detail h3 {
  margin: 0;
  font-size: 20px;
}

.en-wiki-list p,
.en-wiki-detail p {
  margin: 0;
}

.en-wiki-summary,
.en-wiki-detail-head p,
.en-wiki-source-summary,
.en-wiki-citation-detail p {
  margin-top: 10px !important;
  color: var(--en-muted);
  line-height: 1.5;
}

.en-wiki-citations,
.en-wiki-source-list,
.en-wiki-actions,
.en-wiki-source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-wiki-citations {
  margin-top: 14px;
}

.en-wiki-citation,
.en-wiki-source-pill {
  padding: 0 12px;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid var(--en-border);
  background: var(--en-bg);
}

.en-wiki-source-pill.active {
  border-color: color-mix(in srgb, var(--en-primary) 35%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 10%, var(--en-bg));
}

.en-wiki-actions {
  margin-top: 14px;
}

.en-wiki-status {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--en-border);
  color: var(--en-muted);
}

.en-wiki-detail {
  min-height: 0;
  overflow: auto;
}

.en-wiki-source-section,
.en-wiki-source-card,
.en-wiki-citation-detail {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--en-border);
}

.en-wiki-source-card {
  display: grid;
  gap: 12px;
}

.en-wiki-source-meta {
  color: var(--en-muted);
  font-size: 12px;
}

.en-wiki-related-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--en-muted);
}

.en-wiki-related-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.en-wiki-related-card {
  display: grid;
  gap: 4px;
  justify-items: start;
  text-align: left;
  border: 1px solid var(--en-border);
  border-radius: 16px;
  padding: 12px;
  background: var(--en-bg);
}

.en-wiki-related-card strong {
  font-size: 13px;
}

.en-wiki-related-card span {
  color: var(--en-muted);
  font-size: 12px;
}

.en-wiki-citation-detail button {
  margin-top: 10px;
}

@media (max-width: 1080px) {
  .en-wiki-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .en-wiki-hero {
    flex-direction: column;
  }

  .en-wiki-hero-actions {
    flex-wrap: wrap;
  }
}
</style>

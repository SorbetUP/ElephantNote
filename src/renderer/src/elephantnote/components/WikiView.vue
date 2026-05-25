<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <h1>Wiki</h1>
      <p>Local synthesis proposals grounded in cited notes.</p>
      <button
        type="button"
        :disabled="store.wikiLoading"
        @click="store.loadWiki({ regenerate: true })"
      >
        {{ store.wikiLoading ? 'Synthesizing...' : 'Propose wiki pages' }}
      </button>
    </header>

    <div
      v-if="records.length"
      class="en-wiki-list"
    >
      <article
        v-for="record in records"
        :key="record.id"
      >
        <header>
          <h2>#{{ record.topic }}</h2>
          <span>{{ record.citations.length }} citations</span>
        </header>
        <p>
          {{ record.summary }}
        </p>
        <div class="en-wiki-citations">
          <button
            v-for="note in record.citations.slice(0, 6)"
            :key="note.path"
            type="button"
            @click="store.openNote(note)"
          >
            {{ note.title }}
          </button>
        </div>
        <footer class="en-wiki-actions">
          <span>{{ record.status }}</span>
          <button
            v-if="record.status === 'proposed'"
            type="button"
            @click="store.acceptWikiProposal(record.id)"
          >
            Accept
          </button>
          <button
            v-if="record.status === 'proposed'"
            type="button"
            @click="store.dismissWikiProposal(record.id)"
          >
            Dismiss
          </button>
          <button
            v-if="record.notePath"
            type="button"
            @click="store.openNote({ kind: 'note', path: record.notePath, title: record.title })"
          >
            Open page
          </button>
        </footer>
      </article>
    </div>

    <p
      v-else
      class="en-empty-view"
    >
      Add tags to notes to build the local wiki index.
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const records = computed(() => store.wikiProposals.length
  ? store.wikiProposals
  : store.tagTopics.map((topic) => ({
    id: `local-${topic.tag}`,
    topic: topic.tag,
    title: topic.tag,
    summary: `This local topic is grounded in ${topic.notes.length} note${topic.notes.length > 1 ? 's' : ''}.`,
    citations: topic.notes,
    status: 'local'
  })))

onMounted(() => {
  store.loadWiki().catch(() => {})
})

watch(() => store.activeVaultId, () => {
  store.loadWiki().catch(() => {})
})
</script>

<style scoped>
.en-workspace-view {
  min-height: 0;
  flex: 1;
  padding: 28px;
  overflow: auto;
}

.en-workspace-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.en-workspace-header p,
.en-empty-view {
  margin: 6px 0 0;
  color: var(--en-muted);
}

.en-workspace-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  align-items: center;
}

.en-workspace-header p {
  grid-column: 1;
}

.en-workspace-header button,
.en-wiki-actions button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-workspace-header button:hover,
.en-wiki-actions button:hover {
  background: var(--en-soft);
}

.en-workspace-header button:disabled {
  opacity: 0.6;
}

.en-wiki-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
  margin-top: 24px;
}

.en-wiki-list article {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 18px;
  background: var(--en-bg);
}

.en-wiki-list header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.en-wiki-list h2 {
  margin: 0;
  font-size: 18px;
}

.en-wiki-list span,
.en-wiki-list p {
  color: var(--en-muted);
}

.en-wiki-list p {
  margin: 12px 0 0;
  line-height: 1.45;
}

.en-wiki-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.en-wiki-citations button {
  min-height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: transparent;
}

.en-wiki-citations button:hover {
  background: var(--en-soft);
}

.en-wiki-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 16px;
}

.en-wiki-actions span {
  margin-right: auto;
  color: var(--en-muted);
  font-size: 12px;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .en-workspace-header {
    grid-template-columns: 1fr;
  }
}
</style>

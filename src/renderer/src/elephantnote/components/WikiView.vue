<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <h1>Wiki</h1>
      <p>Local synthesis from tags and note metadata.</p>
    </header>

    <div
      v-if="topics.length"
      class="en-wiki-list"
    >
      <article
        v-for="topic in topics"
        :key="topic.tag"
      >
        <header>
          <h2>#{{ topic.tag }}</h2>
          <span>{{ topic.notes.length }} notes</span>
        </header>
        <p>
          This topic is currently grounded in {{ topic.notes.length }} local note{{ topic.notes.length > 1 ? 's' : '' }}.
          The future Atomic synthesis layer will replace this deterministic summary with a cited LLM proposal flow.
        </p>
        <div class="en-wiki-citations">
          <button
            v-for="note in topic.notes.slice(0, 6)"
            :key="note.path"
            type="button"
            @click="store.openNote(note)"
          >
            {{ note.title }}
          </button>
        </div>
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
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const topics = computed(() => store.tagTopics)
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
</style>

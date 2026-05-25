<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <h1>Dashboard</h1>
      <p>{{ store.activeVault?.name || 'Vault' }}</p>
    </header>

    <div class="en-dashboard-stats">
      <article>
        <strong>{{ stats.notes }}</strong>
        <span>Notes</span>
      </article>
      <article>
        <strong>{{ stats.folders }}</strong>
        <span>Folders</span>
      </article>
      <article>
        <strong>{{ stats.tags }}</strong>
        <span>Tags</span>
      </article>
      <article>
        <strong>{{ stats.recent }}</strong>
        <span>Recent</span>
      </article>
    </div>

    <div class="en-dashboard-grid">
      <section>
        <h2>Recently edited</h2>
        <button
          v-for="note in store.recentNoteEntries"
          :key="note.path"
          type="button"
          @click="store.openNote(note)"
        >
          <span>{{ note.title }}</span>
          <small>{{ note.path }}</small>
        </button>
      </section>

      <section>
        <h2>Atomic readiness</h2>
        <ul>
          <li>Local markdown vault: active</li>
          <li>Muya editor: active</li>
          <li>Graph and wiki: local MVP</li>
          <li>Semantic AI layer: planned</li>
          <li>Mobile and plugin runtime: planned</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const stats = computed(() => store.workspaceStats)
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

.en-workspace-header p {
  margin: 6px 0 0;
  color: var(--en-muted);
}

.en-dashboard-stats,
.en-dashboard-grid {
  display: grid;
  gap: 14px;
}

.en-dashboard-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 24px;
}

.en-dashboard-stats article,
.en-dashboard-grid section {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background: var(--en-bg);
}

.en-dashboard-stats article {
  padding: 18px;
}

.en-dashboard-stats strong {
  display: block;
  color: var(--en-text);
  font-size: 30px;
  line-height: 1;
}

.en-dashboard-stats span {
  display: block;
  margin-top: 8px;
  color: var(--en-muted);
  font-size: 13px;
  font-weight: 700;
}

.en-dashboard-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  margin-top: 18px;
}

.en-dashboard-grid section {
  padding: 16px;
}

.en-dashboard-grid h2 {
  margin: 0 0 12px;
  font-size: 15px;
}

.en-dashboard-grid button {
  width: 100%;
  min-height: 46px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: transparent;
  text-align: left;
}

.en-dashboard-grid button:hover {
  background: var(--en-soft);
}

.en-dashboard-grid small,
.en-dashboard-grid li {
  color: var(--en-muted);
  font-size: 13px;
}

.en-dashboard-grid ul {
  margin: 0;
  padding-left: 18px;
}

.en-dashboard-grid li + li {
  margin-top: 8px;
}
</style>

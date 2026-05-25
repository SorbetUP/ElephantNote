<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <h1>Calendar</h1>
      <p>Notes grouped by last edit date.</p>
    </header>

    <div
      v-if="buckets.length"
      class="en-calendar-list"
    >
      <article
        v-for="bucket in buckets"
        :key="bucket.date"
      >
        <time>{{ bucket.date }}</time>
        <div>
          <button
            v-for="note in bucket.notes"
            :key="note.path"
            type="button"
            @click="store.openNote(note)"
          >
            <span>{{ note.title }}</span>
            <small>{{ note.path }}</small>
          </button>
        </div>
      </article>
    </div>

    <p
      v-else
      class="en-empty-view"
    >
      Edit or import notes to populate the local calendar.
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const buckets = computed(() => store.calendarBuckets)
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

.en-calendar-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 24px;
}

.en-calendar-list article {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 14px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--en-bg);
}

.en-calendar-list time {
  color: var(--en-text);
  font-weight: 800;
}

.en-calendar-list div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-calendar-list button {
  min-height: 42px;
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

.en-calendar-list button:hover {
  background: var(--en-soft);
}

.en-calendar-list small {
  color: var(--en-muted);
}
</style>

<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <div>
        <h1>Calendar</h1>
        <p>Offline events plus notes grouped by last edit date.</p>
      </div>
      <button
        type="button"
        :disabled="isImporting"
        @click="importGoogleCalendar"
      >
        {{ isImporting ? 'Importing...' : 'Import Google Calendar' }}
      </button>
    </header>

    <div
      v-if="eventBuckets.length"
      class="en-calendar-list"
    >
      <article
        v-for="bucket in eventBuckets"
        :key="`event-${bucket.date}`"
      >
        <time>{{ bucket.date }}</time>
        <div>
          <section
            v-for="event in bucket.events"
            :key="event.id"
            class="en-calendar-event"
          >
            <span>{{ event.title }}</span>
            <small>{{ formatEventTime(event) }}{{ event.location ? ` · ${event.location}` : '' }}</small>
          </section>
        </div>
      </article>
    </div>

    <div
      v-if="noteBuckets.length"
      class="en-calendar-list"
    >
      <article
        v-for="bucket in noteBuckets"
        :key="`note-${bucket.date}`"
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
      v-if="!hasCalendarItems"
      class="en-empty-view"
    >
      Import events or edit notes to populate the local calendar.
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { elephantnoteClient } from '../services/elephantnoteClient'
import { bucketCalendarEvents } from 'common/elephantnote/calendar'

const store = useVaultStore()
const calendarEvents = ref([])
const isImporting = ref(false)
const noteBuckets = computed(() => store.calendarBuckets)
const eventBuckets = computed(() => bucketCalendarEvents(calendarEvents.value))
const hasCalendarItems = computed(() => noteBuckets.value.length || eventBuckets.value.length)

const loadCalendar = async () => {
  try {
    const calendar = await elephantnoteClient.calendar.list()
    calendarEvents.value = calendar.events || []
  } catch (error) {
    console.warn('Unable to load ElephantNote calendar:', error)
  }
}

const importGoogleCalendar = async () => {
  isImporting.value = true
  try {
    const result = await elephantnoteClient.calendar.importGoogle()
    if (!result?.canceled) {
      calendarEvents.value = result.calendar?.events || []
    }
  } catch (error) {
    console.warn('Unable to import Google Calendar:', error)
  } finally {
    isImporting.value = false
  }
}

const formatEventTime = (event) => {
  if (!event.startsAt) return 'No time'
  if (event.startsAt.length <= 10) return 'All day'
  return event.startsAt.slice(11, 16)
}

onMounted(loadCalendar)
</script>

<style scoped>
.en-workspace-view {
  min-height: 0;
  flex: 1;
  padding: 28px;
  overflow: auto;
}

.en-workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.en-workspace-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.en-workspace-header button {
  min-height: 36px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
  font: inherit;
  font-weight: 700;
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

.en-calendar-list button,
.en-calendar-event {
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

.en-calendar-list small,
.en-calendar-event small {
  color: var(--en-muted);
}
</style>

<template>
  <section class="en-calendar-addon">
    <header class="en-calendar-addon-header">
      <div>
        <p>Addon workspace</p>
        <h1>{{ state?.title || view?.contribution?.title || 'Calendar' }}</h1>
        <span>{{ rangeLabel }}</span>
      </div>
      <div class="en-calendar-addon-actions">
        <button type="button" :disabled="busy" @click="runAction('syncGoogle')">Sync Google</button>
        <button type="button" :disabled="busy" @click="runAction('importGoogle')">Import</button>
        <button type="button" :disabled="loading" title="Refresh" @click="load">↻</button>
        <button type="button" title="Close calendar" @click="emit('close')">×</button>
      </div>
    </header>

    <div class="en-calendar-addon-toolbar">
      <div class="en-calendar-addon-nav">
        <button type="button" @click="goToday"><CalendarClock aria-hidden="true" /> Today</button>
        <button type="button" title="Previous" @click="goPrev"><ChevronLeft aria-hidden="true" /></button>
        <button type="button" title="Next" @click="goNext"><ChevronRight aria-hidden="true" /></button>
      </div>
      <div class="en-calendar-addon-switch" aria-label="Calendar view">
        <button
          v-for="option in viewOptions"
          :key="option.value"
          type="button"
          :class="{ active: currentView === option.value }"
          @click="switchView(option.value)"
        >{{ option.label }}</button>
      </div>
      <span class="en-calendar-addon-count">{{ state?.events?.length || 0 }} events</span>
    </div>

    <div v-if="error" class="en-calendar-addon-message error">
      <strong>Unable to load Calendar</strong>
      <span>{{ error }}</span>
      <button type="button" @click="load">Retry</button>
    </div>
    <div v-else-if="loading" class="en-calendar-addon-message">Loading calendar events…</div>

    <div v-show="!error" class="en-calendar-addon-body">
      <div class="en-calendar-addon-grid">
        <ScheduleXCalendar :calendar-app="calendarApp">
          <template #timeGridEvent="{ calendarEvent }">
            <button class="en-calendar-event timed" :class="eventClass(calendarEvent)" type="button" @click.stop="selectEvent(calendarEvent)">
              <span>{{ calendarEvent.title }}</span>
            </button>
          </template>
          <template #dateGridEvent="{ calendarEvent }">
            <button class="en-calendar-event all-day" :class="eventClass(calendarEvent)" type="button" @click.stop="selectEvent(calendarEvent)">
              <span>{{ calendarEvent.title }}</span>
            </button>
          </template>
          <template #monthGridEvent="{ calendarEvent }">
            <button class="en-calendar-event month" :class="eventClass(calendarEvent)" type="button" @click.stop="selectEvent(calendarEvent)">
              <i />
              <span>{{ calendarEvent.title }}</span>
            </button>
          </template>
        </ScheduleXCalendar>
      </div>

      <aside v-if="selectedEvent" class="en-calendar-event-detail">
        <header>
          <span>Event</span>
          <button type="button" @click="selectedEvent = null">×</button>
        </header>
        <div>
          <h2>{{ selectedEvent.title }}</h2>
          <p>{{ formatEventRange(selectedEvent) }}</p>
          <p v-if="selectedEvent.location"><strong>Location</strong>{{ selectedEvent.location }}</p>
          <p v-if="selectedEvent.description"><strong>Notes</strong>{{ selectedEvent.description }}</p>
          <span class="en-calendar-source">{{ sourceLabel(selectedEvent.source) }}</span>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarClock, ChevronLeft, ChevronRight } from '@lucide/vue'
import { ScheduleXCalendar } from '@schedule-x/vue'
import {
  createCalendar,
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek
} from '@schedule-x/calendar'
import '@schedule-x/theme-default/dist/index.css'
import 'temporal-polyfill/global'

const props = defineProps({ view: { type: Object, required: true } })
const emit = defineEmits(['close'])
const state = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const currentView = ref('month-grid')
const selectedEvent = ref(null)
const rangeLabel = ref('')
let themeObserver = null

const viewOptions = [
  { value: 'month-grid', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'month-agenda', label: 'Agenda' }
]

const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const selectedDate = ref(Temporal.PlainDate.from(localDate()))

const formatDate = (date, options) => new Intl.DateTimeFormat(undefined, options).format(new Date(date.year, date.month - 1, date.day))
const updateRangeLabel = () => {
  const date = selectedDate.value
  if (currentView.value === 'day') {
    rangeLabel.value = formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' })
    return
  }
  if (currentView.value === 'week') {
    const start = date.subtract({ days: date.dayOfWeek - 1 })
    const end = start.add({ days: 6 })
    rangeLabel.value = `${formatDate(start, { month: 'short', day: 'numeric' })} – ${formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
    return
  }
  rangeLabel.value = formatDate(date, { month: 'long', year: 'numeric' })
}
updateRangeLabel()

const temporalValue = (value, fallback) => {
  const raw = String(value || fallback || '').trim()
  if (!raw) return Temporal.PlainDate.from(localDate())
  try {
    if (raw.length > 10) return Temporal.PlainDateTime.from(raw.replace(' ', 'T').slice(0, 19))
    return Temporal.PlainDate.from(raw.slice(0, 10))
  } catch {
    return Temporal.PlainDate.from(localDate())
  }
}

const toCalendarEvent = (event) => {
  const start = temporalValue(event.startsAt)
  const end = temporalValue(event.endsAt, event.startsAt)
  return {
    id: event.id,
    title: event.title || 'Untitled event',
    start,
    end,
    calendarId: event.source === 'google-calendar' ? 'google' : 'local',
    _source: event.source || 'local',
    _raw: event
  }
}

const calendarApp = createCalendar({
  selectedDate: selectedDate.value,
  views: [createViewMonthGrid(), createViewWeek(), createViewDay(), createViewMonthAgenda()],
  defaultView: currentView.value,
  calendars: {
    local: {
      colorName: 'blue',
      lightColors: { main: '#2563eb', container: '#dbeafe', onContainer: '#1e3a8a' },
      darkColors: { main: '#60a5fa', container: '#1e3a5f', onContainer: '#dbeafe' }
    },
    google: {
      colorName: 'purple',
      lightColors: { main: '#7c3aed', container: '#ede9fe', onContainer: '#4c1d95' },
      darkColors: { main: '#a78bfa', container: '#3b2761', onContainer: '#ede9fe' }
    }
  },
  events: [],
  callbacks: {
    onSelectedDateUpdate(date) {
      selectedDate.value = date
      updateRangeLabel()
    },
    onEventClick(event) {
      selectEvent(event)
    }
  }
})

const eventClass = (event) => ({ google: event._source === 'google-calendar', local: event._source !== 'google-calendar' })
const sourceLabel = (source) => source === 'google-calendar' ? 'Google Calendar' : 'Local calendar'
const selectEvent = (event) => { selectedEvent.value = event?._raw || null }
const formatEventRange = (event) => {
  const start = String(event?.startsAt || '')
  const end = String(event?.endsAt || '')
  if (!start) return 'Date unavailable'
  return end && end !== start ? `${start} – ${end}` : start
}

const applyState = (nextState) => {
  state.value = nextState || { events: [] }
  calendarApp.events.set((state.value.events || []).map(toCalendarEvent))
  if (selectedEvent.value && !state.value.events.some((event) => event.id === selectedEvent.value.id)) selectedEvent.value = null
}

const load = async () => {
  const getState = props.view?.contribution?.getState
  if (typeof getState !== 'function') return
  loading.value = true
  error.value = ''
  try {
    applyState(await getState({ selectedDate: selectedDate.value.toString(), view: currentView.value }))
  } catch (cause) {
    error.value = cause?.message || String(cause)
  } finally {
    loading.value = false
  }
}

const runAction = async (action) => {
  const dispatch = props.view?.contribution?.dispatch
  if (typeof dispatch !== 'function') return
  busy.value = true
  error.value = ''
  try {
    const result = await dispatch(action, { selectedDate: selectedDate.value.toString(), view: currentView.value })
    if (result?.state) applyState(result.state)
    else await load()
  } catch (cause) {
    error.value = cause?.message || String(cause)
  } finally {
    busy.value = false
  }
}

const setCalendarDate = (date) => {
  selectedDate.value = date
  calendarApp.$app.datePickerState.selectedDate.value = date
  updateRangeLabel()
}
const goToday = () => setCalendarDate(Temporal.PlainDate.from(localDate()))
const goPrev = () => setCalendarDate(selectedDate.value.subtract(currentView.value === 'day' ? { days: 1 } : currentView.value === 'week' ? { days: 7 } : { months: 1 }))
const goNext = () => setCalendarDate(selectedDate.value.add(currentView.value === 'day' ? { days: 1 } : currentView.value === 'week' ? { days: 7 } : { months: 1 }))
const switchView = (view) => {
  currentView.value = view
  calendarApp.$app.calendarState.setView(view, selectedDate.value)
  updateRangeLabel()
}

const applyTheme = () => {
  const dark = document.documentElement.dataset.elephantnoteTheme === 'dark'
  calendarApp.setTheme(dark ? 'dark' : 'light')
}

watch(() => props.view, load)
onMounted(() => {
  applyTheme()
  themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-elephantnote-theme'] })
  void load()
})
onBeforeUnmount(() => themeObserver?.disconnect())
</script>

<style scoped>
.en-calendar-addon { min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--en-bg); }
.en-calendar-addon-header { min-height: 84px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 24px 12px; border-bottom: 1px solid var(--en-border); }
.en-calendar-addon-header > div:first-child { min-width: 0; display: grid; gap: 2px; }
.en-calendar-addon-header p, .en-calendar-addon-header h1, .en-calendar-addon-header span { margin: 0; }
.en-calendar-addon-header p { color: var(--en-primary); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.en-calendar-addon-header h1 { font-size: 25px; line-height: 1.15; }
.en-calendar-addon-header span { color: var(--en-muted); font-size: 12px; }
.en-calendar-addon-actions, .en-calendar-addon-nav, .en-calendar-addon-switch { display: flex; align-items: center; gap: 6px; }
.en-calendar-addon-actions button, .en-calendar-addon-nav button, .en-calendar-addon-switch button, .en-calendar-addon-message button { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--en-border); border-radius: 8px; color: var(--en-text); background: var(--en-surface); font: inherit; font-size: 11px; cursor: pointer; }
.en-calendar-addon-actions button:disabled { opacity: .5; cursor: wait; }
.en-calendar-addon-actions button:hover:not(:disabled), .en-calendar-addon-nav button:hover, .en-calendar-addon-switch button:hover, .en-calendar-addon-switch button.active { background: var(--en-soft); }
.en-calendar-addon-actions button:last-child { width: 32px; padding: 0; font-size: 18px; }
.en-calendar-addon-nav svg { width: 14px; height: 14px; }
.en-calendar-addon-toolbar { min-height: 48px; display: flex; align-items: center; gap: 16px; padding: 8px 24px; border-bottom: 1px solid var(--en-border); }
.en-calendar-addon-count { margin-left: auto; color: var(--en-muted); font-size: 11px; }
.en-calendar-addon-message { margin: 18px 24px 0; display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--en-border); border-radius: 9px; color: var(--en-muted); background: var(--en-surface); font-size: 12px; }
.en-calendar-addon-message.error { border-color: color-mix(in srgb, var(--en-danger, #dc2626) 45%, var(--en-border)); color: var(--en-danger, #dc2626); }
.en-calendar-addon-body { min-height: 0; flex: 1; display: flex; overflow: hidden; }
.en-calendar-addon-grid { min-width: 0; min-height: 0; flex: 1; padding: 12px 16px 16px; overflow: auto; }
.en-calendar-event { width: 100%; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 2px 5px; border: 0; border-radius: 5px; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.en-calendar-event span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.en-calendar-event.month i { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: currentColor; }
.en-calendar-event.google { color: #7c3aed; }
.en-calendar-event.local { color: #2563eb; }
.en-calendar-event-detail { width: min(300px, 34vw); min-width: 240px; border-left: 1px solid var(--en-border); background: var(--en-surface); overflow: auto; }
.en-calendar-event-detail header { height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid var(--en-border); color: var(--en-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.en-calendar-event-detail header button { border: 0; color: var(--en-muted); background: transparent; font-size: 18px; cursor: pointer; }
.en-calendar-event-detail > div { display: grid; gap: 12px; padding: 18px; }
.en-calendar-event-detail h2, .en-calendar-event-detail p { margin: 0; }
.en-calendar-event-detail h2 { font-size: 18px; line-height: 1.3; }
.en-calendar-event-detail p { display: grid; gap: 3px; color: var(--en-muted); font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.en-calendar-event-detail p strong { color: var(--en-text); font-size: 10px; text-transform: uppercase; }
.en-calendar-source { justify-self: start; padding: 3px 7px; border: 1px solid var(--en-border); border-radius: 999px; color: var(--en-muted); font-size: 10px; }
:deep(.sx__calendar-wrapper) { height: 100%; min-height: 560px; border: 0; border-radius: 10px; overflow: hidden; }
@media (max-width: 860px) { .en-calendar-addon-header { align-items: flex-start; flex-direction: column; } .en-calendar-addon-toolbar { flex-wrap: wrap; } .en-calendar-addon-count { margin-left: 0; } .en-calendar-event-detail { display: none; } }
</style>

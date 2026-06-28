<template>
  <section class="en-workspace-view en-calendar-workspace">
    <header class="en-workspace-header">
      <div class="en-calendar-title">
        <h1>Calendar</h1>
        <span>{{ rangeLabel }}</span>
      </div>
      <div class="en-calendar-controls">
        <div class="en-calendar-nav">
          <button
            type="button"
            class="en-cal-btn en-cal-btn-icon"
            title="Today"
            @click="goToday"
          >
            <CalendarClock class="en-cal-icon" />
          </button>
          <button
            type="button"
            class="en-cal-btn en-cal-btn-icon"
            title="Previous"
            @click="goPrev"
          >
            <ChevronLeft class="en-cal-icon" />
          </button>
          <button
            type="button"
            class="en-cal-btn en-cal-btn-icon"
            title="Next"
            @click="goNext"
          >
            <ChevronRight class="en-cal-icon" />
          </button>
        </div>
        <div class="en-calendar-view-switch">
          <button
            v-for="v in viewOptions"
            :key="v.value"
            type="button"
            class="en-cal-btn"
            :class="{ 'en-cal-btn-active': currentView === v.value }"
            @click="switchView(v.value)"
          >
            {{ v.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="en-calendar-container">
      <ScheduleXCalendar
        :calendar-app="calendarApp"
        :custom-components="customComponents"
      >
        <template #timeGridEvent="{ calendarEvent }">
          <div
            class="en-cal-event en-cal-event--timed"
            :class="eventClass(calendarEvent)"
          >
            <span class="en-cal-event-title">{{ calendarEvent.title }}</span>
          </div>
        </template>
        <template #dateGridEvent="{ calendarEvent }">
          <div
            class="en-cal-event en-cal-event--allday"
            :class="eventClass(calendarEvent)"
          >
            <span class="en-cal-event-title">{{ calendarEvent.title }}</span>
          </div>
        </template>
        <template #monthGridEvent="{ calendarEvent }">
          <div
            class="en-cal-event en-cal-event--month"
            :class="eventClass(calendarEvent)"
          >
            <span class="en-cal-event-dot" />
            <span class="en-cal-event-title">{{ calendarEvent.title }}</span>
          </div>
        </template>
      </ScheduleXCalendar>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarClock, ChevronLeft, ChevronRight } from '@lucide/vue'
import { ScheduleXCalendar } from '@schedule-x/vue'
import {
  createCalendar,
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
  createViewMonthAgenda
} from '@schedule-x/calendar'
import '@schedule-x/theme-default/dist/index.css'
import 'temporal-polyfill/global'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const store = useVaultStore()
const currentView = ref('month-grid')
const selectedDate = ref(null)
const rangeLabel = ref('')

const viewOptions = [
  { value: 'month-grid', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'month-agenda', label: 'Agenda' }
]

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
selectedDate.value = Temporal.PlainDate.from(todayStr)

const formatDate = (date, options) => new Intl.DateTimeFormat(undefined, options).format(
  new Date(date.year, date.month - 1, date.day)
)

const formatRange = (start, end) => {
  const sameYear = start.year === end.year
  const sameMonth = sameYear && start.month === end.month
  if (sameMonth) {
    return `${formatDate(start, { month: 'short', day: 'numeric' })} - ${formatDate(end, { day: 'numeric', year: 'numeric' })}`
  }
  if (sameYear) {
    return `${formatDate(start, { month: 'short', day: 'numeric' })} - ${formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return `${formatDate(start, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const getSourceType = (event) => {
  if (event._isNote) return 'notes'
  if (event.source === 'google-calendar') return 'google'
  return 'local'
}

const eventClass = (event) => ({
  'en-cal-event--note': event._sourceType === 'notes',
  'en-cal-event--google': event._sourceType === 'google',
  'en-cal-event--local': event._sourceType === 'local'
})

const updateRangeLabel = () => {
  const date = selectedDate.value
  if (!date) return

  if (currentView.value === 'day') {
    rangeLabel.value = formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' })
    return
  }

  if (currentView.value === 'week') {
    const start = date.subtract({ days: date.dayOfWeek - 1 })
    rangeLabel.value = formatRange(start, start.add({ days: 6 }))
    return
  }

  rangeLabel.value = formatDate(date, { month: 'long', year: 'numeric' })
}

updateRangeLabel()

const toSxEvent = (event) => {
  const isAllday = !event.startsAt || event.startsAt.length <= 10
  const startStr = event.startsAt || todayStr
  const endStr = event.endsAt || startStr
  const sourceType = getSourceType(event)

  if (isAllday) {
    const startDate = Temporal.PlainDate.from(startStr.slice(0, 10))
    const rawEnd = endStr.slice(0, 10)
    let endDate = Temporal.PlainDate.from(rawEnd)
    if (Temporal.PlainDate.compare(endDate, startDate) <= 0) {
      endDate = startDate
    }
    return {
      id: event.id,
      title: event.title || 'Untitled',
      start: startDate,
      end: endDate,
      calendarId: 'en-events',
      _isNote: false,
      _sourceType: sourceType,
      _rawEvent: event
    }
  }

  const startDateTime = Temporal.PlainDate.from(startStr.slice(0, 10))
  const endDateTime = Temporal.PlainDate.from(endStr.slice(0, 10))
  return {
    id: event.id,
    title: event.title || 'Untitled',
    start: startDateTime,
    end: endDateTime,
    calendarId: 'en-events',
    _isNote: false,
    _sourceType: sourceType,
    _rawEvent: event
  }
}

const toNoteEvent = (note) => {
  const day = note.lastModified || note.updatedAt || ''
  if (!day) return null
  const dateStr = String(day).slice(0, 10)
  if (dateStr.length < 10) return null
  try {
    const date = Temporal.PlainDate.from(dateStr)
    return {
      id: `note-${note.path}`,
      title: note.title || 'Untitled note',
      start: date,
      end: date,
      calendarId: 'en-notes',
      _isNote: true,
      _sourceType: 'notes',
      _rawEvent: note
    }
  } catch {
    return null
  }
}

const calendarApp = createCalendar({
  selectedDate: Temporal.PlainDate.from(todayStr),
  views: [
    createViewMonthGrid(),
    createViewWeek(),
    createViewDay(),
    createViewMonthAgenda()
  ],
  defaultView: 'month-grid',
  calendars: {
    'en-events': {
      colorName: 'blue',
      lightColors: {
        main: '#5ea1ff',
        container: '#5ea1ff22',
        onContainer: '#2563eb'
      },
      darkColors: {
        main: '#5ea1ff',
        container: '#5ea1ff22',
        onContainer: '#93c5fd'
      }
    },
    'en-notes': {
      colorName: 'purple',
      lightColors: {
        main: '#7c3aed',
        container: '#7c3aed22',
        onContainer: '#6d28d9'
      },
      darkColors: {
        main: '#a78bfa',
        container: '#7c3aed22',
        onContainer: '#c4b5fd'
      }
    }
  },
  events: [],
  isDark: false,
  callbacks: {
    onSelectedDateUpdate (date) {
      selectedDate.value = date
      updateRangeLabel()
    },
    onEventClick (calendarEvent) {
      if (calendarEvent._isNote && calendarEvent._noteRef) {
        store.openNote(calendarEvent._noteRef)
      }
    }
  }
})

const customComponents = {}

const loadEvents = async () => {
  try {
    const result = await elephantnoteClient.calendar.list()
    const events = result?.events || []
    const sxEvents = events.map(toSxEvent)
    const noteEvents = store.recentNoteEntries
      .map((note) => {
        const ev = toNoteEvent(note)
        if (ev) ev._noteRef = note
        return ev
      })
      .filter(Boolean)
    calendarApp.events.set([...sxEvents, ...noteEvents])
  } catch (error) {
    console.warn('Unable to load calendar events:', error)
  }
}

const setCalendarDate = (date) => {
  selectedDate.value = date
  calendarApp.$app.datePickerState.selectedDate.value = date
  updateRangeLabel()
}

const goToday = () => {
  setCalendarDate(Temporal.PlainDate.from(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  ))
}

const goPrev = () => {
  const step = currentView.value === 'day'
    ? { days: 1 }
    : currentView.value === 'week'
      ? { days: 7 }
      : { months: 1 }
  setCalendarDate(selectedDate.value.subtract(step))
}

const goNext = () => {
  const step = currentView.value === 'day'
    ? { days: 1 }
    : currentView.value === 'week'
      ? { days: 7 }
      : { months: 1 }
  setCalendarDate(selectedDate.value.add(step))
}

const switchView = (view) => {
  currentView.value = view
  calendarApp.$app.calendarState.setView(view, selectedDate.value)
  updateRangeLabel()
}

const applyTheme = () => {
  const root = document.documentElement
  const enTheme = root.dataset.elephantnoteTheme
  const isDark = enTheme === 'dark'
  calendarApp.setTheme(isDark ? 'dark' : 'light')

  const sxRoot = document.querySelector('.en-calendar-container')
  if (!sxRoot) return

  const get = (name) => getComputedStyle(root).getPropertyValue(name).trim()

  if (isDark) {
    sxRoot.style.setProperty('--sx-color-primary', get('--en-primary') || '#5ea1ff')
    sxRoot.style.setProperty('--sx-color-on-primary', '#ffffff')
    sxRoot.style.setProperty('--sx-color-primary-container', '#5ea1ff22')
    sxRoot.style.setProperty('--sx-color-on-primary-container', '#93c5fd')
    sxRoot.style.setProperty('--sx-color-surface', get('--en-bg') || '#0f141d')
    sxRoot.style.setProperty('--sx-color-surface-dim', get('--en-surface') || '#141a24')
    sxRoot.style.setProperty('--sx-color-surface-bright', get('--en-soft') || '#1b2432')
    sxRoot.style.setProperty('--sx-color-surface-container', get('--en-surface') || '#141a24')
    sxRoot.style.setProperty('--sx-color-surface-container-low', get('--en-bg') || '#0f141d')
    sxRoot.style.setProperty('--sx-color-surface-container-high', get('--en-soft-strong') || '#202b3b')
    sxRoot.style.setProperty('--sx-color-background', get('--en-bg') || '#0f141d')
    sxRoot.style.setProperty('--sx-color-on-background', get('--en-text') || '#eef3fb')
    sxRoot.style.setProperty('--sx-color-on-surface', get('--en-text') || '#eef3fb')
    sxRoot.style.setProperty('--sx-color-outline', get('--en-border') || '#283244')
    sxRoot.style.setProperty('--sx-color-outline-variant', get('--en-border') || '#283244')
    sxRoot.style.setProperty('--sx-internal-color-text', get('--en-text') || '#eef3fb')
    sxRoot.style.setProperty('--sx-internal-color-light-gray', get('--en-soft') || '#1b2432')
    sxRoot.style.setProperty('--sx-internal-color-gray-ripple-background', get('--en-soft') || '#1b2432')
  } else {
    sxRoot.style.setProperty('--sx-color-primary', get('--en-primary') || '#2563eb')
    sxRoot.style.setProperty('--sx-color-on-primary', '#ffffff')
    sxRoot.style.setProperty('--sx-color-primary-container', '#2563eb14')
    sxRoot.style.setProperty('--sx-color-on-primary-container', '#1d4ed8')
    sxRoot.style.setProperty('--sx-color-surface', get('--en-surface') || '#ffffff')
    sxRoot.style.setProperty('--sx-color-surface-dim', get('--en-soft') || '#e9eff7')
    sxRoot.style.setProperty('--sx-color-surface-bright', get('--en-surface') || '#ffffff')
    sxRoot.style.setProperty('--sx-color-surface-container', get('--en-surface') || '#ffffff')
    sxRoot.style.setProperty('--sx-color-surface-container-low', get('--en-bg') || '#f7f9fc')
    sxRoot.style.setProperty('--sx-color-surface-container-high', get('--en-soft') || '#e9eff7')
    sxRoot.style.setProperty('--sx-color-background', get('--en-bg') || '#f7f9fc')
    sxRoot.style.setProperty('--sx-color-on-background', get('--en-text') || '#101828')
    sxRoot.style.setProperty('--sx-color-on-surface', get('--en-text') || '#101828')
    sxRoot.style.setProperty('--sx-color-outline', get('--en-border') || '#c5cfdd')
    sxRoot.style.setProperty('--sx-color-outline-variant', get('--en-border') || '#c5cfdd')
    sxRoot.style.setProperty('--sx-internal-color-text', get('--en-text') || '#101828')
    sxRoot.style.setProperty('--sx-internal-color-light-gray', get('--en-soft') || '#e9eff7')
    sxRoot.style.setProperty('--sx-internal-color-gray-ripple-background', get('--en-soft') || '#e9eff7')
  }
}

let themeObserver = null
let stopRecentNotesWatch = null

onMounted(async () => {
  await nextTick()
  await loadEvents()
  applyTheme()

  themeObserver = new MutationObserver(() => {
    applyTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-elephantnote-theme']
  })

  stopRecentNotesWatch = watch(
    () => store.recentNoteEntries,
    () => loadEvents(),
    { deep: true }
  )
})

onBeforeUnmount(() => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (stopRecentNotesWatch) {
    stopRecentNotesWatch()
    stopRecentNotesWatch = null
  }
})
</script>

<style scoped>
.en-calendar-workspace {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 6px 28px 28px;
}

.en-workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  min-height: 44px;
}

.en-calendar-title h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.en-calendar-title {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
}

.en-calendar-title span {
  color: var(--en-muted);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.en-calendar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.en-calendar-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.en-cal-btn {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.en-cal-btn:hover {
  color: var(--en-text);
  border-color: var(--en-border);
  background: var(--en-soft);
}

.en-cal-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0;
}

.en-cal-icon {
  width: 17px;
  height: 17px;
}

.en-calendar-view-switch {
  display: flex;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  overflow: hidden;
}

.en-calendar-view-switch .en-cal-btn {
  border-right: 1px solid var(--en-border);
}

.en-calendar-view-switch .en-cal-btn:last-child {
  border-right: none;
}

.en-cal-btn-active {
  color: #ffffff !important;
  background: var(--en-primary) !important;
}

.en-calendar-container {
  flex: 1;
  min-height: 400px;
  margin-top: 18px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--en-bg);
}

.en-cal-event {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  height: 100%;
  overflow: hidden;
  border-radius: 4px;
}

.en-cal-event-title {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.en-cal-event-dot {
  width: 6px;
  height: 6px;
  min-width: 6px;
  border-radius: 50%;
  background: currentColor;
}

.en-cal-event--note .en-cal-event-title {
  font-style: italic;
}

.en-cal-event--google {
  box-shadow: inset 3px 0 0 #2563eb;
}

.en-cal-event--local {
  box-shadow: inset 3px 0 0 #059669;
}

</style>

<style>
.en-calendar-container .sx-vue-calendar-wrapper {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.en-calendar-container .schedule-x-calendar {
  border: none;
  border-radius: 0;
  background: var(--en-bg);
}

.en-calendar-container .sx__calendar-header {
  display: none;
}

.en-calendar-container .sx__calendar-wrapper {
  background: var(--en-bg);
}

.en-calendar-container .sx__month-grid-wrapper,
.en-calendar-container .sx__week-wrapper,
.en-calendar-container .sx__list-wrapper {
  background: var(--en-bg);
}

.en-calendar-container .sx__month-grid-week,
.en-calendar-container .sx__week-header-border,
.en-calendar-container .sx__week-grid__hour,
.en-calendar-container .sx__list-event:not(:first-child) {
  border-color: var(--en-border);
}

.en-calendar-container .sx__month-grid-day:not(:last-child),
.en-calendar-container .sx__time-grid-day {
  border-color: var(--en-border);
}

.en-calendar-container .sx__week-header,
.en-calendar-container .sx__week-agenda-header,
.en-calendar-container .sx__list-day,
.en-calendar-container .sx__list-day-events {
  background: var(--en-bg);
}

.en-calendar-container .sx__list-day-header {
  background: var(--en-soft);
  border-bottom: 1px solid var(--en-border);
}

.en-calendar-container .sx__month-grid-day__header-day-name,
.en-calendar-container .sx__week-grid__day-name,
.en-calendar-container .sx__list-day-date,
.en-calendar-container .sx__week-grid__hour-text,
.en-calendar-container .sx__list-event-end-time,
.en-calendar-container .sx__list-event-all-day,
.en-calendar-container .sx__list-event-arrow {
  color: var(--en-muted);
  letter-spacing: 0;
}

.en-calendar-container .sx__month-grid-day__header-date,
.en-calendar-container .sx__week-grid__date-number,
.en-calendar-container .sx__list-event-title,
.en-calendar-container .sx__list-event-start-time {
  color: var(--en-text);
}

.en-calendar-container .sx__month-grid-day__header-date.sx__is-today,
.en-calendar-container .sx__week-grid__date--is-today .sx__week-grid__date-number {
  background: var(--en-primary);
  color: #ffffff;
}

.en-calendar-container .sx__week-grid__date--is-today .sx__week-grid__day-name {
  color: var(--en-primary);
}

.en-calendar-container .sx__month-agenda-day--active {
  box-shadow: inset 0 0 0 2px var(--en-primary);
}

.en-calendar-container .sx__month-agenda-events__empty,
.en-calendar-container .sx__list-no-events {
  color: var(--en-muted);
}

.en-calendar-container .sx__time-grid-hour {
  font-size: 11px;
  color: var(--en-muted);
}

.en-calendar-container .sx__week-grid__hour-line {
  border-color: var(--en-border);
}

.en-calendar-container .sx__week-grid__day-boundary {
  border-color: var(--en-border);
}

.en-calendar-container .sx__month-grid__day {
  border-color: var(--en-border);
}

.en-calendar-container .sx__month-grid__date-number {
  font-size: 13px;
}

.en-calendar-container .sx__month-grid__date-number--today {
  background: var(--en-primary);
  color: #ffffff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  display: inline-block;
}

.en-calendar-container .sx__month-grid__date-number--other-month {
  opacity: 0.4;
}

.en-calendar-container .sx__header__view-selector {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  overflow: hidden;
}

.en-calendar-container .sx__header__view-selector-item {
  font-size: 13px;
  font-weight: 600;
}

.en-calendar-container .sx__header__view-selector-item.is-active {
  background: var(--en-primary);
  color: #ffffff;
}

.en-calendar-container .sx__event {
  border-radius: 4px;
  font-size: 12px;
}

.en-calendar-container .sx__grid-day--selected {
  background: var(--en-soft);
}

.en-calendar-container .sx__month-grid__day-names span {
  font-size: 12px;
  font-weight: 600;
  color: var(--en-muted);
}

.en-calendar-container .sx__current-time-indicator {
  background: var(--en-primary);
}

.en-calendar-container .sx__current-time-indicator__dot {
  background: var(--en-primary);
}

.en-calendar-container ::-webkit-scrollbar {
  width: 6px;
}

.en-calendar-container ::-webkit-scrollbar-thumb {
  background: var(--en-border);
  border-radius: 3px;
}

.en-calendar-container ::-webkit-scrollbar-track {
  background: transparent;
}
</style>

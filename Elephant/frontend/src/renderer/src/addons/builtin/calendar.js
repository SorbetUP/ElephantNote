import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'

const ADDON_ID = 'elephant.calendar'
const VIEW_ID = `${ADDON_ID}.workspace`

const normalizeEvent = (event = {}) => ({
  id: String(event.id || `${event.title || 'event'}-${event.startsAt || Date.now()}`),
  title: String(event.title || 'Untitled event'),
  startsAt: String(event.startsAt || event.start || ''),
  endsAt: String(event.endsAt || event.end || event.startsAt || event.start || ''),
  source: String(event.source || 'local'),
  location: String(event.location || ''),
  description: String(event.description || '')
})

const loadCalendarState = async () => {
  const result = await elephantnoteClient.calendar.list()
  const events = Array.isArray(result?.events) ? result.events.map(normalizeEvent) : []
  const sources = events.reduce((counts, event) => {
    const source = event.source || 'local'
    counts[source] = (counts[source] || 0) + 1
    return counts
  }, {})
  return {
    schema: 'calendar-v1',
    title: 'Calendar',
    subtitle: 'Offline events plus notes grouped by last edit date.',
    events,
    sources,
    refreshedAt: new Date().toISOString()
  }
}

export const calendarAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Calendar',
    version: '1.1.0',
    description: 'Restores the native ElephantNote calendar workspace for offline events, imported calendars and recently edited notes.',
    author: 'ElephantNote',
    icon: 'calendar-days',
    defaultEnabled: false,
    removable: true,
    permissions: ['calendar.read', 'calendar.sync'],
    contributes: {
      actions: true,
      views: true
    }
  },

  activate(ctx) {
    ctx.addView({
      id: VIEW_ID,
      title: 'Calendar',
      description: 'Offline events plus notes grouped by last edit date.',
      icon: 'calendar-days',
      kind: 'calendar-v1',
      order: 40,
      getState: loadCalendarState,
      async dispatch(action) {
        if (action === 'refresh') return { state: await loadCalendarState() }
        if (action === 'syncGoogle') {
          await elephantnoteClient.calendar.syncGoogle()
          return { state: await loadCalendarState() }
        }
        if (action === 'importGoogle') {
          const result = await elephantnoteClient.calendar.importGoogle()
          return { result, state: await loadCalendarState() }
        }
        throw new Error(`Unsupported calendar action: ${action}`)
      }
    })

    ctx.addAction({
      id: `${ADDON_ID}.sync-google`,
      title: 'Sync Google Calendar',
      description: 'Synchronize the configured Google Calendar account and refresh local events.',
      async run() {
        const result = await elephantnoteClient.calendar.syncGoogle()
        ctx.logger?.info?.('[addons] calendar:sync-google', result)
        return result
      }
    })

    ctx.addAction({
      id: `${ADDON_ID}.import-google`,
      title: 'Import Google Calendar export',
      description: 'Choose and import a Google Calendar export into the active vault calendar.',
      async run() {
        const result = await elephantnoteClient.calendar.importGoogle()
        ctx.logger?.info?.('[addons] calendar:import-google', result)
        return result
      }
    })
  }
}

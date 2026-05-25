import { normalizeCalendarEvent } from './calendar'

export const normalizeGoogleCalendarConfig = (config = {}) => ({
  enabled: config.enabled === true,
  clientId: String(config.clientId || '').trim(),
  clientSecret: String(config.clientSecret || '').trim(),
  refreshToken: String(config.refreshToken || '').trim(),
  accessToken: String(config.accessToken || '').trim(),
  calendarId: String(config.calendarId || 'primary').trim() || 'primary'
})

export const googleEventToCalendarEvent = (event = {}, calendarId = 'primary') => normalizeCalendarEvent({
  id: event.id,
  title: event.summary,
  startsAt: event.start?.dateTime || event.start?.date || '',
  endsAt: event.end?.dateTime || event.end?.date || '',
  location: event.location || '',
  description: event.description || '',
  source: 'google-calendar',
  calendarId
})

export const calendarEventToGoogleEvent = (event = {}) => {
  const normalized = normalizeCalendarEvent(event)
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(normalized.startsAt)
  return {
    summary: normalized.title,
    location: normalized.location,
    description: normalized.description,
    start: allDay
      ? { date: normalized.startsAt }
      : { dateTime: normalized.startsAt },
    end: allDay
      ? { date: normalized.endsAt || normalized.startsAt }
      : { dateTime: normalized.endsAt || normalized.startsAt }
  }
}

const unfoldIcsLines = (ics = '') => {
  const lines = String(ics || '').split(/\r?\n/)
  const unfolded = []
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.slice(1)
    } else {
      unfolded.push(line)
    }
  }
  return unfolded
}

const splitIcsProperty = (line = '') => {
  const separatorIndex = line.indexOf(':')
  if (separatorIndex < 0) return null
  const rawName = line.slice(0, separatorIndex)
  const value = line.slice(separatorIndex + 1)
  const [name, ...paramParts] = rawName.split(';')
  const params = {}
  for (const part of paramParts) {
    const [key, rawValue = ''] = part.split('=')
    if (key) params[key.toUpperCase()] = rawValue
  }
  return {
    name: name.toUpperCase(),
    params,
    value
  }
}

const decodeIcsText = (value = '') => String(value)
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\')

export const normalizeCalendarDate = (value = '') => {
  const input = String(value || '').trim()
  if (!input) return ''
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`
  }
  const match = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
  if (match) {
    const [, year, month, day, hour, minute, second] = match
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${input.endsWith('Z') ? 'Z' : ''}`
  }
  return input
}

export const normalizeCalendarEvent = (event = {}) => {
  const id = String(event.id || event.uid || '').trim()
  const startsAt = normalizeCalendarDate(event.startsAt || event.start || event.dtstart)
  const endsAt = normalizeCalendarDate(event.endsAt || event.end || event.dtend)
  const title = String(event.title || event.summary || 'Untitled event').trim()
  return {
    id: id || `${startsAt}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    title,
    startsAt,
    endsAt,
    location: String(event.location || '').trim(),
    description: String(event.description || '').trim(),
    source: String(event.source || 'local').trim(),
    calendarId: String(event.calendarId || 'default').trim()
  }
}

export const parseIcsCalendar = (ics = '', { source = 'google-calendar' } = {}) => {
  const events = []
  let current = null
  for (const line of unfoldIcsLines(ics)) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current) {
        events.push(normalizeCalendarEvent({
          id: current.UID,
          title: current.SUMMARY,
          startsAt: current.DTSTART,
          endsAt: current.DTEND,
          location: current.LOCATION,
          description: current.DESCRIPTION,
          source
        }))
      }
      current = null
      continue
    }
    if (!current) continue
    const property = splitIcsProperty(line)
    if (!property) continue
    current[property.name] = decodeIcsText(property.value)
  }
  return events
}

export const mergeCalendarEvents = (existing = [], incoming = []) => {
  const byId = new Map()
  for (const event of existing) {
    const normalized = normalizeCalendarEvent(event)
    byId.set(normalized.id, normalized)
  }
  for (const event of incoming) {
    const normalized = normalizeCalendarEvent(event)
    byId.set(normalized.id, normalized)
  }
  return [...byId.values()].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
}

export const bucketCalendarEvents = (events = []) => {
  const buckets = new Map()
  for (const event of events.map(normalizeCalendarEvent)) {
    const day = String(event.startsAt || '').slice(0, 10) || 'No date'
    const bucket = buckets.get(day) || []
    bucket.push(event)
    buckets.set(day, bucket)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      events: items.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
    }))
}

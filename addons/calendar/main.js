const ADDON_ID = 'elephant.calendar'
const VIEW_ID = `${ADDON_ID}.workspace`
const PROVIDER_RESOURCE = 'calendar.provider'
const EVENTS_KEY_PREFIX = 'events'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const decodeIcsText = (value = '') => String(value || '')
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\')
  .trim()

const normalizeIcsDate = (value = '') => {
  const input = String(value || '').trim()
  if (!input) return ''
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`
  }
  const match = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!match) return input
  const [, year, month, day, hour, minute, second, zulu] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${zulu ? 'Z' : ''}`
}

const deterministicEventId = (event = {}) => [
  event.title || 'Untitled event',
  event.startsAt || '',
  event.endsAt || '',
  event.location || ''
].join('|')

export const parseIcs = (source = '') => {
  const unfolded = String(source || '').replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)
  const events = []
  let current = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const event = {
          title: decodeIcsText(current.SUMMARY || 'Untitled event'),
          startsAt: normalizeIcsDate(current.DTSTART || ''),
          endsAt: normalizeIcsDate(current.DTEND || current.DTSTART || ''),
          source: 'ics',
          location: decodeIcsText(current.LOCATION || ''),
          description: decodeIcsText(current.DESCRIPTION || '')
        }
        event.id = String(current.UID || deterministicEventId(event)).trim()
        events.push(event)
      }
      current = null
      continue
    }
    if (!current || !line.includes(':')) continue
    const separator = line.indexOf(':')
    const key = line.slice(0, separator).split(';')[0].toUpperCase()
    current[key] = line.slice(separator + 1)
  }

  return events
}

export const normalizeEvents = (value) => (Array.isArray(value) ? value : [])
  .map((event) => {
    const normalized = {
      title: String(event?.title || 'Untitled event'),
      startsAt: String(event?.startsAt || event?.start || ''),
      endsAt: String(event?.endsAt || event?.end || event?.startsAt || event?.start || ''),
      source: String(event?.source || 'local'),
      location: String(event?.location || ''),
      description: String(event?.description || '')
    }
    return {
      ...normalized,
      id: String(event?.id || deterministicEventId(normalized))
    }
  })
  .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title))

export const mergeEvents = (current, incoming) => {
  const byId = new Map(normalizeEvents(current).map((event) => [event.id, event]))
  for (const event of normalizeEvents(incoming)) byId.set(event.id, event)
  return normalizeEvents([...byId.values()])
}

export default class ElephantCalendarAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  async activeVaultId() {
    const getVaults = this.window?.elephantnote?.getVaults
    if (typeof getVaults !== 'function') return 'unscoped'
    const state = await getVaults().catch(() => null)
    return String(state?.activeVault?.id || state?.activeVaultId || 'unscoped')
  }

  async storageKey() {
    return `${EVENTS_KEY_PREFIX}:${await this.activeVaultId()}`
  }

  async loadEvents() {
    return normalizeEvents(await this.api.storage.get(await this.storageKey()))
  }

  async saveEvents(events) {
    const normalized = normalizeEvents(events)
    await this.api.storage.set(await this.storageKey(), normalized)
    this.api.app.emit('elephantnote:calendar-events-changed', { events: normalized })
    return normalized
  }

  async importIcsText(source, sourceLabel = 'ics') {
    const parsed = parseIcs(source).map((event) => ({ ...event, source: sourceLabel }))
    if (!parsed.length) throw new Error('No VEVENT entry was found in the selected calendar file')
    const merged = mergeEvents(await this.loadEvents(), parsed)
    await this.saveEvents(merged)
    return { imported: parsed.length, total: merged.length, events: merged }
  }

  async importFiles(files) {
    const selected = Array.from(files || []).filter((file) => /\.(ics|ical)$/i.test(String(file?.name || '')))
    if (!selected.length) throw new Error('Select one or more .ics calendar files')
    let imported = 0
    let events = await this.loadEvents()
    const failures = []
    for (const file of selected) {
      try {
        const parsed = parseIcs(await file.text()).map((event) => ({ ...event, source: file.name || 'ics' }))
        if (!parsed.length) throw new Error('No VEVENT entry found')
        imported += parsed.length
        events = mergeEvents(events, parsed)
      } catch (error) {
        failures.push({ file: file.name || 'unknown.ics', error: error instanceof Error ? error.message : String(error) })
      }
    }
    await this.saveEvents(events)
    return { selected: selected.length, imported, total: events.length, failures, events }
  }

  async clearEvents() {
    await this.api.storage.remove(await this.storageKey())
    this.api.app.emit('elephantnote:calendar-events-changed', { events: [] })
    return []
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-calendar-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading calendar…'))
      try {
        const events = await this.loadEvents()
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Calendar'), node(documentRef, 'p', '', `${events.length} events in the active vault`))
        header.append(copy)
        root.append(header)

        const picker = node(documentRef, 'input', 'elephant-calendar-picker')
        picker.type = 'file'
        picker.accept = '.ics,.ical,text/calendar'
        picker.multiple = true
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const importButton = node(documentRef, 'button', '', 'Import ICS')
        importButton.disabled = true
        const clearButton = node(documentRef, 'button', '', 'Clear events')
        const feedback = node(documentRef, 'pre', 'elephant-calendar-feedback')
        picker.onchange = () => {
          importButton.disabled = !picker.files?.length
          feedback.textContent = picker.files?.length ? `${picker.files.length} file(s) selected.` : ''
        }
        importButton.onclick = async () => {
          importButton.disabled = true
          try {
            const result = await this.importFiles(picker.files)
            feedback.textContent = [`Imported ${result.imported} event(s).`, ...result.failures.map((failure) => `${failure.file}: ${failure.error}`)].join('\n')
            await refresh()
          } finally {
            importButton.disabled = !picker.files?.length
          }
        }
        clearButton.onclick = async () => {
          await this.clearEvents()
          await refresh()
        }
        actions.append(picker, importButton, clearButton)
        root.append(actions, feedback)

        const list = node(documentRef, 'div', 'elephant-calendar-list')
        if (!events.length) list.append(node(documentRef, 'p', 'elephant-package-muted', 'No calendar event imported.'))
        for (const event of events) {
          const article = node(documentRef, 'article', 'elephant-calendar-event')
          article.append(
            node(documentRef, 'strong', '', event.title),
            node(documentRef, 'span', '', [event.startsAt, event.endsAt].filter(Boolean).join(' → ')),
            node(documentRef, 'small', '', [event.source, event.location].filter(Boolean).join(' · '))
          )
          if (event.description) article.append(node(documentRef, 'p', '', event.description))
          list.append(article)
        }
        root.append(list)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-package-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh()
    return () => {
      disposed = true
      root.remove()
    }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-calendar-package { display:grid; align-content:start; gap:14px; padding:18px; height:100%; overflow:auto; box-sizing:border-box; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .elephant-calendar-picker { flex:1; min-width:260px; padding:10px; border:1px dashed var(--en-border); border-radius:10px; background:var(--en-surface); color:var(--en-text); }
      .elephant-package-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-calendar-feedback { min-height:18px; margin:0; white-space:pre-wrap; color:var(--en-muted); }
      .elephant-calendar-list { display:grid; gap:10px; }
      .elephant-calendar-event { display:grid; gap:5px; padding:14px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-surface); }
      .elephant-calendar-event span,.elephant-calendar-event small,.elephant-calendar-event p { color:var(--en-muted); margin:0; }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'calendar-package')

    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      list: () => this.loadEvents(),
      status: async() => ({ vaultId: await this.activeVaultId(), events: (await this.loadEvents()).length }),
      importIcs: (source, sourceLabel = 'ics') => this.importIcsText(source, sourceLabel),
      importFiles: (files) => this.importFiles(files),
      clear: () => this.clearEvents()
    }))

    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Calendar',
      description: 'Import and review package-owned ICS events for the active vault.',
      icon: 'calendar-days',
      kind: 'calendar-v3',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalCalendar', mount: (element) => this.render(element) }),
      order: 40
    })

    api.commands.register({
      id: `${ADDON_ID}.open`,
      title: 'Open Calendar',
      run: () => api.workspace.openView(VIEW_ID)
    })
  }
}

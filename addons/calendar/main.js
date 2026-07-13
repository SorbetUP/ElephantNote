const ADDON_ID = 'elephant.calendar'
const VIEW_ID = `${ADDON_ID}.workspace`
const EVENTS_KEY = 'events'
const GOOGLE_CONFIG_KEY = 'google-config'

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

const parseIcs = (source = '') => {
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
        const startsAt = normalizeIcsDate(current.DTSTART || '')
        const endsAt = normalizeIcsDate(current.DTEND || current.DTSTART || '')
        const title = decodeIcsText(current.SUMMARY || 'Untitled event')
        const id = String(current.UID || `${title}-${startsAt}`).trim()
        events.push({
          id,
          title,
          startsAt,
          endsAt,
          source: 'ics',
          location: decodeIcsText(current.LOCATION || ''),
          description: decodeIcsText(current.DESCRIPTION || '')
        })
      }
      current = null
      continue
    }
    if (!current || !line.includes(':')) continue
    const separator = line.indexOf(':')
    const rawKey = line.slice(0, separator)
    const key = rawKey.split(';')[0].toUpperCase()
    current[key] = line.slice(separator + 1)
  }

  return events
}

const normalizeEvents = (value) => (Array.isArray(value) ? value : [])
  .map((event) => ({
    id: String(event?.id || `${event?.title || 'event'}-${event?.startsAt || Date.now()}`),
    title: String(event?.title || 'Untitled event'),
    startsAt: String(event?.startsAt || event?.start || ''),
    endsAt: String(event?.endsAt || event?.end || event?.startsAt || event?.start || ''),
    source: String(event?.source || 'local'),
    location: String(event?.location || ''),
    description: String(event?.description || '')
  }))
  .sort((left, right) => left.startsAt.localeCompare(right.startsAt))

const mergeEvents = (current, incoming) => {
  const byId = new Map(normalizeEvents(current).map((event) => [event.id, event]))
  for (const event of normalizeEvents(incoming)) byId.set(event.id, event)
  return normalizeEvents([...byId.values()])
}

export default class ElephantCalendarAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async loadState() {
    return normalizeEvents(await this.api.storage.get(EVENTS_KEY))
  }

  async saveEvents(events) {
    const normalized = normalizeEvents(events)
    await this.api.storage.set(EVENTS_KEY, normalized)
    return normalized
  }

  async getGoogleConfig() {
    const config = await this.api.storage.get(GOOGLE_CONFIG_KEY)
    return config && typeof config === 'object' ? { ...config } : { icsUrl: '' }
  }

  async setGoogleConfig(config = {}) {
    const normalized = { icsUrl: String(config.icsUrl || '').trim() }
    await this.api.storage.set(GOOGLE_CONFIG_KEY, normalized)
    return normalized
  }

  async importIcsText(source, sourceLabel = 'ics') {
    const parsed = parseIcs(source).map((event) => ({ ...event, source: sourceLabel }))
    if (!parsed.length) throw new Error('No VEVENT entry was found in the selected calendar file')
    const merged = mergeEvents(await this.loadState(), parsed)
    await this.saveEvents(merged)
    return { imported: parsed.length, total: merged.length }
  }

  async importGoogleFile() {
    const dialog = this.window?.__TAURI__?.dialog
    const fs = this.window?.__TAURI__?.fs
    if (typeof dialog?.open !== 'function') throw new Error('File dialog is unavailable')
    const selected = await dialog.open({
      multiple: false,
      directory: false,
      filters: [{ name: 'iCalendar', extensions: ['ics', 'ical'] }]
    })
    const path = typeof selected === 'string' ? selected : selected?.path
    if (!path) return { imported: 0, cancelled: true }

    let content = ''
    if (typeof fs?.readTextFile === 'function') content = await fs.readTextFile(path)
    else content = (await this.invoke('tauri_fs_read_markdown', { path }))?.markdown || ''
    return this.importIcsText(content, 'google-export')
  }

  async syncGoogle() {
    const config = await this.getGoogleConfig()
    if (!config.icsUrl) throw new Error('Configure a private Google Calendar ICS URL first')
    const response = await this.invoke('tauri_addons_http_request', {
      addonId: ADDON_ID,
      params: { method: 'GET', url: config.icsUrl }
    })
    if (!response?.ok) throw new Error(`Google Calendar request failed with HTTP ${response?.status || 'error'}`)
    return this.importIcsText(response.body || '', 'google-calendar')
  }

  async render(container) {
    const documentRef = container.ownerDocument
    let disposed = false
    const root = node(documentRef, 'section', 'elephant-calendar-package')
    container.replaceChildren(root)

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading calendar…'))
      try {
        const [events, config] = await Promise.all([this.loadState(), this.getGoogleConfig()])
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Calendar'), node(documentRef, 'p', '', `${events.length} events`))
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const refreshButton = node(documentRef, 'button', '', 'Refresh')
        refreshButton.onclick = () => void refresh()
        const syncButton = node(documentRef, 'button', '', 'Sync Google')
        syncButton.onclick = async () => { syncButton.disabled = true; try { await this.syncGoogle(); await refresh() } finally { syncButton.disabled = false } }
        const importButton = node(documentRef, 'button', '', 'Import ICS')
        importButton.onclick = async () => { await this.importGoogleFile(); await refresh() }
        actions.append(refreshButton, syncButton, importButton)
        header.append(copy, actions)
        root.append(header)

        const configCard = node(documentRef, 'div', 'elephant-calendar-config')
        const configInput = node(documentRef, 'input')
        configInput.type = 'url'
        configInput.placeholder = 'Private Google Calendar ICS URL'
        configInput.value = config.icsUrl || ''
        const saveConfig = node(documentRef, 'button', '', 'Save URL')
        const feedback = node(documentRef, 'span', 'elephant-package-muted')
        saveConfig.onclick = async () => {
          await this.setGoogleConfig({ icsUrl: configInput.value })
          feedback.textContent = 'Saved.'
          this.window.setTimeout(() => { feedback.textContent = '' }, 1200)
        }
        configCard.append(configInput, saveConfig, feedback)
        root.append(configCard)

        const list = node(documentRef, 'div', 'elephant-calendar-list')
        if (!events.length) list.append(node(documentRef, 'p', 'elephant-package-muted', 'No event available.'))
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
    return () => { disposed = true; root.remove() }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-calendar-package { display:grid; align-content:start; gap:14px; padding:18px; height:100%; overflow:auto; box-sizing:border-box; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions,.elephant-calendar-config { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .elephant-package-actions button,.elephant-calendar-config button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-calendar-config input { flex:1; min-width:300px; min-height:34px; padding:0 10px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); }
      .elephant-calendar-list { display:grid; gap:10px; }
      .elephant-calendar-event { display:grid; gap:5px; padding:14px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-surface); }
      .elephant-calendar-event span,.elephant-calendar-event small,.elephant-calendar-event p { color:var(--en-muted); margin:0; }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'calendar-package')

    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    const component = bridge.createDomComponent({
      name: 'ElephantPhysicalCalendar',
      className: 'elephant-physical-calendar-host',
      mount: (container) => this.render(container)
    })

    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Calendar',
      description: 'Package-owned events and Google Calendar ICS synchronization.',
      icon: 'calendar-days',
      kind: 'calendar-v3',
      component,
      order: 40
    })

    api.commands.register({
      id: `${ADDON_ID}.sync-google`,
      title: 'Sync Google Calendar',
      run: () => this.syncGoogle()
    })
    api.commands.register({
      id: `${ADDON_ID}.import-google`,
      title: 'Import Google Calendar export',
      run: () => this.importGoogleFile()
    })
  }
}

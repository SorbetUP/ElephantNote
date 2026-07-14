const ADDON_ID = 'elephant.calendar'
const VIEW_ID = `${ADDON_ID}.workspace`
const PROVIDER_RESOURCE = 'calendar.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const asArray = (value) => Array.isArray(value) ? value : []
const asObject = (value) => value && typeof value === 'object' ? value : {}

export default class ElephantCalendarAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.state = { events: [], google: { configured: false, calendars: [] } }
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async loadState() {
    const [events, google] = await Promise.all([
      this.invoke('tauri_calendar_list').catch(() => []),
      this.invoke('tauri_calendar_google_config_get').catch(() => ({ configured: false, calendars: [] }))
    ])
    this.state = {
      events: asArray(events),
      google: asObject(google)
    }
    return this.state
  }

  getGoogleConfig() {
    return this.invoke('tauri_calendar_google_config_get')
  }

  setGoogleConfig(config = {}) {
    return this.invoke('tauri_calendar_google_config_set', { config: asObject(config) })
  }

  importGoogleFromPath(path) {
    if (!String(path || '').trim()) throw new TypeError('An ICS file path is required')
    return this.invoke('tauri_calendar_import_google_from_path', { path: String(path) })
  }

  syncGoogle() {
    return this.invoke('tauri_calendar_google_sync')
  }

  async importGoogleFile() {
    const open = this.window?.__TAURI__?.dialog?.open
    if (typeof open !== 'function') throw new Error('Tauri dialog API is unavailable')
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Calendar', extensions: ['ics'] }]
    })
    if (!selected) return null
    const path = typeof selected === 'string' ? selected : selected.path
    if (!path) return null
    return this.importGoogleFromPath(path)
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-calendar-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-calendar-muted', 'Loading calendar…'))
      try {
        const state = await this.loadState()
        if (disposed) return
        root.replaceChildren()

        const header = node(documentRef, 'header', 'elephant-calendar-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Calendar'), node(documentRef, 'p', '', `${state.events.length} events`))
        const actions = node(documentRef, 'div', 'elephant-calendar-actions')
        const importButton = node(documentRef, 'button', '', 'Import ICS')
        importButton.onclick = async () => {
          importButton.disabled = true
          try {
            await this.importGoogleFile()
            await refresh()
          } finally {
            importButton.disabled = false
          }
        }
        const syncButton = node(documentRef, 'button', '', 'Sync Google')
        syncButton.disabled = state.google?.configured !== true
        syncButton.onclick = async () => {
          syncButton.disabled = true
          try {
            await this.syncGoogle()
            await refresh()
          } finally {
            syncButton.disabled = false
          }
        }
        const reload = node(documentRef, 'button', '', 'Refresh')
        reload.onclick = () => void refresh()
        actions.append(importButton, syncButton, reload)
        header.append(copy, actions)
        root.append(header)

        const googleCard = node(documentRef, 'article', 'elephant-calendar-card')
        googleCard.append(node(documentRef, 'strong', '', 'Google Calendar'))
        googleCard.append(node(documentRef, 'small', '', state.google?.configured ? 'Configured' : 'Not configured'))
        if (state.google?.account) googleCard.append(node(documentRef, 'small', '', String(state.google.account)))
        root.append(googleCard)

        const events = node(documentRef, 'div', 'elephant-calendar-events')
        if (!state.events.length) events.append(node(documentRef, 'p', 'elephant-calendar-muted', 'No events imported.'))
        for (const event of state.events) {
          const article = node(documentRef, 'article', 'elephant-calendar-event')
          const title = event.title || event.summary || 'Untitled event'
          article.append(node(documentRef, 'strong', '', title))
          article.append(node(documentRef, 'small', '', [event.start || event.startAt, event.end || event.endAt, event.location].filter(Boolean).join(' · ')))
          if (event.description) article.append(node(documentRef, 'p', '', String(event.description)))
          events.append(article)
        }
        root.append(events)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-calendar-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-calendar-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:14px; padding:18px; }
      .elephant-calendar-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-calendar-header h2,.elephant-calendar-header p { margin:0; }
      .elephant-calendar-header p,.elephant-calendar-muted { color:var(--en-muted); }
      .elephant-calendar-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .elephant-calendar-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-calendar-card,.elephant-calendar-event { display:grid; gap:7px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-calendar-card small,.elephant-calendar-event small { color:var(--en-muted); }
      .elephant-calendar-events { display:grid; gap:10px; }
      .elephant-calendar-event p { margin:0; }
      .elephant-calendar-error { color:var(--en-danger,#b42318); }
    `, 'calendar-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      list: () => this.loadState().then((state) => state.events),
      status: () => this.loadState(),
      googleConfigGet: () => this.getGoogleConfig(),
      googleConfigSet: (config = {}) => this.setGoogleConfig(config),
      importGoogleFromPath: (path) => this.importGoogleFromPath(path),
      syncGoogle: () => this.syncGoogle()
    }))

    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Calendar',
      description: 'Review imported events and synchronize Google Calendar.',
      icon: 'calendar-days',
      kind: 'calendar-v3',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalCalendar', mount: (container) => this.render(container) }),
      order: 60
    })
  }
}

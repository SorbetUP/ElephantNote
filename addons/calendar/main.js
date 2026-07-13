const ADDON_ID = 'elephant.calendar'
const VIEW_ID = `${ADDON_ID}.workspace`

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantCalendarAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  async loadState() {
    const result = await this.call('calendar.list')
    const events = Array.isArray(result?.events) ? result.events : []
    return events
      .map((event) => ({
        id: String(event.id || `${event.title || 'event'}-${event.startsAt || Date.now()}`),
        title: String(event.title || 'Untitled event'),
        startsAt: String(event.startsAt || event.start || ''),
        endsAt: String(event.endsAt || event.end || event.startsAt || event.start || ''),
        source: String(event.source || 'local'),
        location: String(event.location || ''),
        description: String(event.description || '')
      }))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  }

  render(container) {
    const documentRef = container.ownerDocument
    let disposed = false
    const root = node(documentRef, 'section', 'elephant-calendar-package')
    container.replaceChildren(root)

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading calendar…'))
      try {
        const events = await this.loadState()
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Calendar'), node(documentRef, 'p', '', `${events.length} events`))
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const refreshButton = node(documentRef, 'button', '', 'Refresh')
        refreshButton.onclick = () => void refresh()
        const syncButton = node(documentRef, 'button', '', 'Sync Google')
        syncButton.onclick = async () => { await this.call('calendar.google.sync'); await refresh() }
        const importButton = node(documentRef, 'button', '', 'Import Google')
        importButton.onclick = async () => { await this.call('calendar.importGoogle'); await refresh() }
        actions.append(refreshButton, syncButton, importButton)
        header.append(copy, actions)
        root.append(header)

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

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-calendar-package { display:grid; gap:14px; padding:18px; height:100%; overflow:auto; box-sizing:border-box; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .elephant-package-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
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
      description: 'Offline events and Google Calendar synchronization.',
      icon: 'calendar-days',
      kind: 'calendar-v2',
      component,
      order: 40
    })

    api.commands.register({
      id: `${ADDON_ID}.sync-google`,
      title: 'Sync Google Calendar',
      async run() { return api.experimental.window.elephantnote.api.call('calendar.google.sync', {}) }
    })
    api.commands.register({
      id: `${ADDON_ID}.import-google`,
      title: 'Import Google Calendar export',
      async run() { return api.experimental.window.elephantnote.api.call('calendar.importGoogle', {}) }
    })
  }
}

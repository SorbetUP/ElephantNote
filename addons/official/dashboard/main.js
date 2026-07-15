const ADDON_ID = 'elephant.dashboard'
const VIEW_ID = `${ADDON_ID}.workspace`
const PROVIDER_RESOURCE = 'dashboard.provider'
const DASHBOARD_PATH = '.dashboard/Dashboard.md'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const asArray = (value) => Array.isArray(value) ? value : []

export default class ElephantDashboardAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  vaultStore() {
    return this.api.app.pinia?._s?.get?.('elephantnoteVaults') || null
  }

  async ensureDashboardNote() {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error('The Dashboard addon requires the Tauri note bridge')

    let result
    try {
      result = await invoke('tauri_notes_read', { relativePath: DASHBOARD_PATH })
    } catch {
      result = await invoke('tauri_notes_create', {
        relativePath: '.dashboard',
        filename: 'Dashboard.md',
        title: 'Dashboard'
      })
    }

    const note = result?.note || result || {}
    const store = this.vaultStore()
    return {
      ...note,
      path: note.path || DASHBOARD_PATH,
      fullPath: note.fullPath || (store?.activeVault?.path ? `${store.activeVault.path}/${DASHBOARD_PATH}` : ''),
      title: note.title || 'Dashboard',
      kind: 'note',
      type: 'note',
      updatedAt: note.updatedAt || new Date().toISOString()
    }
  }

  async openDashboardNote() {
    const store = this.vaultStore()
    if (!store?.activeVault?.path) throw new Error('Open a vault before opening its Dashboard note')
    const note = await this.ensureDashboardNote()
    store.openNote(note, { record: false })
    return note
  }

  status() {
    const store = this.vaultStore()
    return {
      activeVaultId: store?.activeVaultId || '',
      activeVaultName: store?.activeVault?.name || '',
      notes: Number(store?.workspaceStats?.notes || store?.activeNoteEntries?.length || 0),
      folders: Number(store?.workspaceStats?.folders || 0),
      recent: asArray(store?.recentNoteEntries).length,
      dashboardPath: DASHBOARD_PATH
    }
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-dashboard-package')
    container.replaceChildren(root)
    let disposed = false

    const render = () => {
      if (disposed) return
      const store = this.vaultStore()
      root.replaceChildren()

      const header = node(documentRef, 'header', 'elephant-dashboard-header')
      const copy = node(documentRef, 'div')
      copy.append(
        node(documentRef, 'h2', '', 'Dashboard'),
        node(documentRef, 'p', '', store?.activeVault?.name || 'No vault open')
      )
      const openButton = node(documentRef, 'button', 'elephant-dashboard-primary', 'Open Dashboard note')
      openButton.type = 'button'
      openButton.disabled = !store?.activeVault?.path
      openButton.addEventListener('click', async () => {
        openButton.disabled = true
        try {
          await this.openDashboardNote()
        } finally {
          openButton.disabled = !this.vaultStore()?.activeVault?.path
        }
      })
      header.append(copy, openButton)
      root.append(header)

      const status = this.status()
      const metrics = node(documentRef, 'div', 'elephant-dashboard-metrics')
      for (const [label, value] of [
        ['Notes', status.notes],
        ['Folders', status.folders],
        ['Recent', status.recent]
      ]) {
        const card = node(documentRef, 'article', 'elephant-dashboard-metric')
        card.append(node(documentRef, 'strong', '', String(value)), node(documentRef, 'span', '', label))
        metrics.append(card)
      }
      root.append(metrics)

      const recentSection = node(documentRef, 'section', 'elephant-dashboard-recent')
      recentSection.append(node(documentRef, 'h3', '', 'Recently edited'))
      const recentList = node(documentRef, 'div', 'elephant-dashboard-recent-list')
      const recentNotes = asArray(store?.recentNoteEntries).slice(0, 8)
      if (!recentNotes.length) recentList.append(node(documentRef, 'p', 'elephant-dashboard-muted', 'No recently edited note.'))
      for (const note of recentNotes) {
        const button = node(documentRef, 'button', 'elephant-dashboard-note')
        button.type = 'button'
        button.append(
          node(documentRef, 'strong', '', String(note.title || 'Untitled')),
          node(documentRef, 'span', '', String(note.path || ''))
        )
        button.addEventListener('click', () => store?.openNote?.(note))
        recentList.append(button)
      }
      recentSection.append(recentList)
      root.append(recentSection)
    }

    render()
    const timer = this.window.setInterval(render, 1200)
    return () => {
      disposed = true
      this.window.clearInterval(timer)
      root.remove()
    }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-dashboard-package { height:100%; overflow:auto; display:grid; align-content:start; gap:18px; padding:24px; box-sizing:border-box; background:var(--en-bg); color:var(--en-text); }
      .elephant-dashboard-header { display:flex; align-items:center; justify-content:space-between; gap:18px; }
      .elephant-dashboard-header h2,.elephant-dashboard-header p,.elephant-dashboard-recent h3 { margin:0; }
      .elephant-dashboard-header h2 { font-size:28px; }
      .elephant-dashboard-header p,.elephant-dashboard-muted { color:var(--en-muted); }
      .elephant-dashboard-primary { min-height:38px; padding:0 14px; border:1px solid var(--en-primary); border-radius:10px; background:var(--en-primary); color:#fff; font:inherit; cursor:pointer; }
      .elephant-dashboard-primary:disabled { opacity:.5; cursor:default; }
      .elephant-dashboard-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
      .elephant-dashboard-metric { display:grid; gap:5px; padding:18px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-dashboard-metric strong { font-size:25px; }
      .elephant-dashboard-metric span { color:var(--en-muted); }
      .elephant-dashboard-recent { display:grid; gap:10px; }
      .elephant-dashboard-recent-list { display:grid; gap:7px; }
      .elephant-dashboard-note { min-width:0; display:grid; gap:3px; padding:12px 14px; border:1px solid var(--en-border); border-radius:10px; background:var(--en-surface); color:var(--en-text); text-align:left; cursor:pointer; }
      .elephant-dashboard-note:hover { border-color:var(--en-primary); background:var(--en-soft); }
      .elephant-dashboard-note span { overflow:hidden; color:var(--en-muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
      @media (max-width:700px) { .elephant-dashboard-package { padding:16px; } .elephant-dashboard-header { align-items:flex-start; flex-direction:column; } .elephant-dashboard-metrics { grid-template-columns:1fr; } }
    `, 'dashboard-package')

    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      status: () => this.status(),
      openNote: () => this.openDashboardNote()
    }))

    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Dashboard',
      description: 'Review vault statistics and recently edited notes.',
      icon: 'dashboard',
      kind: 'dashboard-v1',
      component: bridge.createDomComponent({
        name: 'ElephantPhysicalDashboard',
        mount: (element) => this.render(element)
      }),
      order: 10
    })

    api.commands.register({
      id: `${ADDON_ID}.open`,
      title: 'Open Dashboard',
      run: () => api.workspace.openView(VIEW_ID)
    })
    api.commands.register({
      id: `${ADDON_ID}.open-note`,
      title: 'Open Dashboard note',
      run: () => this.openDashboardNote()
    })
  }
}

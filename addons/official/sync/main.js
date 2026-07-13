const ADDON_ID = 'elephant.sync'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantSyncAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.listeners = new Set()
    this.status = { state: 'idle' }
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async refreshStatus() {
    this.status = await this.invoke('iroh_sync_status').catch((error) => ({ state: 'error', error: error.message || String(error) }))
    for (const listener of this.listeners) listener(this.status)
    return this.status
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  renderTopBar(container) {
    const documentRef = container.ownerDocument
    const button = node(documentRef, 'button', 'elephant-sync-topbar', 'Sync')
    container.replaceChildren(button)
    let running = false
    const apply = (status) => {
      const state = status?.state || status?.status || 'idle'
      button.dataset.state = state
      button.title = status?.error || `Sync: ${state}`
      button.textContent = running || ['syncing', 'running'].includes(state) ? 'Syncing…' : state === 'error' ? 'Sync error' : 'Sync'
    }
    const off = this.subscribe(apply)
    button.onclick = async () => {
      if (running) return
      running = true; apply({ state: 'running' })
      try { await this.invoke('iroh_sync_run', { payload: {} }); await this.refreshStatus() }
      catch (error) { this.status = { state: 'error', error: error.message || String(error) }; apply(this.status) }
      finally { running = false; apply(this.status) }
    }
    void this.refreshStatus()
    return () => { off(); button.remove() }
  }

  renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-sync-settings')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      const status = await this.refreshStatus()
      if (disposed) return
      root.replaceChildren()
      const header = node(documentRef, 'header', 'elephant-sync-header')
      const copy = node(documentRef, 'div')
      const state = status?.state || status?.status || 'idle'
      copy.append(node(documentRef, 'h3', '', 'Sync'), node(documentRef, 'p', '', `State: ${state}`))
      const run = node(documentRef, 'button', '', 'Sync now')
      run.onclick = async () => { run.disabled = true; try { await this.invoke('iroh_sync_run', { payload: {} }); await refresh() } finally { run.disabled = false } }
      header.append(copy, run)
      root.append(header)

      const pairing = node(documentRef, 'div', 'elephant-sync-card')
      pairing.append(node(documentRef, 'h4', '', 'Pair a device'))
      const invite = node(documentRef, 'textarea')
      invite.placeholder = 'Create or paste an Iroh pairing invite'
      invite.rows = 4
      const actions = node(documentRef, 'div', 'elephant-sync-actions')
      const create = node(documentRef, 'button', '', 'Create invite')
      create.onclick = async () => {
        const result = await this.invoke('iroh_sync_create_invite')
        invite.value = String(result?.invite || result?.code || result?.url || JSON.stringify(result))
      }
      const accept = node(documentRef, 'button', '', 'Accept invite')
      accept.onclick = async () => { await this.invoke('iroh_sync_accept_invite', { invite: invite.value.trim() }); await refresh() }
      actions.append(create, accept)
      pairing.append(invite, actions)
      root.append(pairing)

      const details = node(documentRef, 'pre', 'elephant-sync-details')
      details.textContent = JSON.stringify(status, null, 2)
      root.append(details)
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-sync-topbar { min-height:30px; padding:0 10px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sync-topbar[data-state=error] { color:var(--en-danger,#b42318); }
      .elephant-sync-settings { display:grid; gap:14px; }
      .elephant-sync-header { display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .elephant-sync-header h3,.elephant-sync-header p,.elephant-sync-card h4 { margin:0; }
      .elephant-sync-header p { color:var(--en-muted); }
      .elephant-sync-header button,.elephant-sync-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sync-card { display:grid; gap:10px; padding:14px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-sync-card textarea { width:100%; box-sizing:border-box; padding:9px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-bg); color:var(--en-text); }
      .elephant-sync-actions { display:flex; gap:8px; }
      .elephant-sync-details { max-height:240px; overflow:auto; padding:12px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-soft); color:var(--en-muted); font-size:11px; }
    `, 'sync-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sync',
      navigationLabel: 'Sync',
      navigationIcon: 'cloud',
      standalone: true,
      chrome: false,
      title: 'Sync',
      description: 'Pair devices and synchronize vaults over encrypted Iroh connections.',
      order: 50,
      render: (container) => this.renderSettings(container)
    })

    api.workspace.registerContribution('top-bar.items', {
      id: `${ADDON_ID}.navigation-control`,
      kind: 'sync-control-v2',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalSyncTopbar', mount: (container) => this.renderTopBar(container) }),
      order: 30
    })

    await this.refreshStatus()
  }

  onunload() {
    return this.invoke('iroh_sync_shutdown').catch(() => {})
  }
}

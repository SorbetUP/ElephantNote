const ADDON_ID = 'elephant.sites'
const PROVIDER_RESOURCE = 'sites.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const normalizeSite = (value) => value && typeof value === 'object' ? value : null

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.site = null
    this.status = null
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async openPreview(params = {}) {
    this.site = normalizeSite(await this.invoke('tauri_site_preview_folder', params))
    await this.refreshStatus()
    return this.site
  }

  async refreshStatus(siteId = this.site?.siteId) {
    if (!siteId) {
      this.status = null
      return null
    }
    this.status = await this.invoke('tauri_site_preview_status', { siteId })
    return this.status
  }

  async stopPreview(siteId = this.site?.siteId) {
    if (!siteId) return { stopped: false }
    const result = await this.invoke('tauri_site_preview_stop', { siteId })
    if (siteId === this.site?.siteId) {
      this.site = null
      this.status = null
    }
    return result
  }

  openExternal(url = this.site?.url) {
    if (!url) return null
    return this.invoke('tauri_site_preview_open_external', { url })
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-sites-package')
    container.replaceChildren(root)
    let disposed = false

    const renderState = () => {
      if (disposed) return
      root.replaceChildren()
      const header = node(documentRef, 'header', 'elephant-sites-header')
      const copy = node(documentRef, 'div')
      copy.append(node(documentRef, 'h2', '', 'Sites'), node(documentRef, 'p', '', 'Preview a static folder through the package-owned Sites service.'))
      const actions = node(documentRef, 'div', 'elephant-sites-actions')
      const preview = node(documentRef, 'button', '', this.site ? 'Choose another folder' : 'Preview folder')
      preview.onclick = async () => {
        preview.disabled = true
        try { await this.openPreview(); renderState() } finally { preview.disabled = false }
      }
      const refresh = node(documentRef, 'button', '', 'Refresh')
      refresh.disabled = !this.site
      refresh.onclick = async () => { await this.refreshStatus(); renderState() }
      actions.append(preview, refresh)
      header.append(copy, actions)
      root.append(header)

      if (!this.site) {
        root.append(node(documentRef, 'p', 'elephant-sites-empty', 'No site preview is running.'))
        return
      }
      const card = node(documentRef, 'article', 'elephant-sites-card')
      card.append(node(documentRef, 'strong', '', this.site.name || this.site.siteId || 'Site preview'))
      card.append(node(documentRef, 'small', '', this.site.sourcePath || this.site.path || ''))
      card.append(node(documentRef, 'code', '', this.site.url || ''))
      const controls = node(documentRef, 'div', 'elephant-sites-actions')
      const open = node(documentRef, 'button', '', 'Open')
      open.onclick = () => this.openExternal()
      const stop = node(documentRef, 'button', '', 'Stop')
      stop.onclick = async () => { await this.stopPreview(); renderState() }
      controls.append(open, stop)
      card.append(controls)
      if (this.status) card.append(node(documentRef, 'pre', 'elephant-sites-status', JSON.stringify(this.status, null, 2)))
      root.append(card)
    }

    renderState()
    return () => { disposed = true; root.remove() }
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-sites-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:14px; padding:18px; }
      .elephant-sites-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-sites-header h2,.elephant-sites-header p { margin:0; }
      .elephant-sites-header p,.elephant-sites-empty { color:var(--en-muted); }
      .elephant-sites-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .elephant-sites-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sites-card { display:grid; gap:9px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-sites-card small { color:var(--en-muted); }
      .elephant-sites-card code { overflow:auto; padding:8px; border-radius:8px; background:var(--en-soft); }
      .elephant-sites-status { max-height:220px; overflow:auto; margin:0; padding:10px; background:var(--en-soft); color:var(--en-muted); }
    `, 'sites-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      previewFolder: (params = {}) => this.openPreview(params),
      status: (siteId) => this.refreshStatus(siteId),
      stop: (siteId) => this.stopPreview(siteId),
      openExternal: (url) => this.openExternal(url)
    }))

    api.workspace.registerView({
      id: `${ADDON_ID}.workspace`,
      title: 'Sites',
      description: 'Preview and open static folders.',
      icon: 'globe',
      kind: 'sites-v2',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalSites', mount: (container) => this.render(container) }),
      order: 55
    })
  }

  onunload() {
    return this.stopPreview().catch(() => {})
  }
}

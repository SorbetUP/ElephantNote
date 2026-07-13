const ADDON_ID = 'elephant.sites'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const normalizeRelativePath = (value = '') => {
  const normalized = String(value || '').trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new Error('Site folder must stay inside the active vault')
  }
  return parts.join('/')
}

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.preview = null
    this.frames = new Set()
  }

  async allowDirectory(relativePath) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error('Tauri asset host is unavailable')
    return invoke('tauri_addons_assets_allow_directory', {
      addonId: ADDON_ID,
      relativePath: relativePath || '.'
    })
  }

  toAssetUrl(path) {
    const convertFileSrc = this.window?.__TAURI__?.core?.convertFileSrc
    if (typeof convertFileSrc !== 'function') throw new Error('Tauri asset URL conversion is unavailable')
    return convertFileSrc(path, 'asset')
  }

  async openPreview(relativePath) {
    await this.stopPreview().catch(() => {})
    const relative = normalizeRelativePath(relativePath)
    const allowed = await this.allowDirectory(relative || '.')
    const base = String(allowed?.path || '').replace(/[\\/]+$/, '')
    if (!base) throw new Error('The selected site directory is unavailable')
    const separator = base.includes('\\') ? '\\' : '/'
    const entry = `${base}${separator}index.html`
    const url = this.toAssetUrl(entry)
    this.preview = {
      siteId: `asset:${relative || '.'}`,
      url,
      root: base,
      running: true,
      status: 'ready',
      mode: 'asset'
    }
    for (const frame of this.frames) {
      frame.src = url
      frame.hidden = false
    }
    return this.preview
  }

  refreshStatus() {
    return Promise.resolve(this.preview || { status: 'idle', running: false, mode: 'asset' })
  }

  async stopPreview() {
    this.preview = null
    for (const frame of this.frames) {
      frame.src = 'about:blank'
      frame.hidden = true
    }
    return { stopped: true }
  }

  async openExternal(url) {
    if (!url) return
    const opener = this.window?.__TAURI__?.opener
    if (typeof opener?.openUrl === 'function') return opener.openUrl(url)
    this.window.open(url, '_blank', 'noopener,noreferrer')
  }

  render(container, compact = false) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', compact ? 'elephant-sites-panel compact' : 'elephant-sites-panel')
    container.replaceChildren(root)
    const folder = node(documentRef, 'input')
    folder.placeholder = 'Static site folder inside the active vault'
    const status = node(documentRef, 'p', 'elephant-sites-status', 'Idle')
    const actions = node(documentRef, 'div', 'elephant-sites-actions')
    const preview = node(documentRef, 'button', '', 'Preview')
    const stop = node(documentRef, 'button', '', 'Stop')
    const open = node(documentRef, 'button', '', 'Open')
    const frame = node(documentRef, 'iframe', 'elephant-sites-preview')
    frame.title = 'Site preview'
    frame.hidden = true
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads')
    this.frames.add(frame)

    const renderStatus = async () => {
      const current = await this.refreshStatus().catch((error) => ({ status: 'error', error: error.message || String(error) }))
      status.textContent = current?.error || current?.status || (current?.running ? 'Ready' : 'Idle')
      open.disabled = !current?.url || current?.running === false
      stop.disabled = current?.running !== true
    }

    preview.onclick = async () => {
      preview.disabled = true
      status.textContent = 'Opening preview…'
      try {
        await this.openPreview(folder.value)
        await renderStatus()
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        preview.disabled = false
      }
    }
    stop.onclick = async () => { await this.stopPreview(); await renderStatus() }
    open.onclick = () => this.openExternal(this.preview?.url)
    actions.append(preview, stop, open)
    root.append(node(documentRef, compact ? 'h4' : 'h3', '', 'Sites'), folder, actions, status, frame)
    void renderStatus()
    return () => {
      this.frames.delete(frame)
      root.remove()
    }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-sites-panel { display:grid; gap:10px; padding:14px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-sites-panel.compact { margin:12px; }
      .elephant-sites-panel h3,.elephant-sites-panel h4,.elephant-sites-status { margin:0; }
      .elephant-sites-panel input { min-height:34px; padding:0 10px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-bg); color:var(--en-text); }
      .elephant-sites-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .elephant-sites-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sites-status { color:var(--en-muted); font-size:12px; }
      .elephant-sites-preview { width:100%; min-height:360px; border:1px solid var(--en-border); border-radius:10px; background:white; }
    `, 'sites-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.workspace.registerContribution('site.generators', {
      id: `${ADDON_ID}.generator`,
      title: 'Elephant Sites',
      description: 'Cross-platform static site preview from a scoped vault directory.'
    })
    api.layout.registerZone({
      id: `${ADDON_ID}.preview-panel`,
      zone: 'workspace.notes',
      order: 80,
      component: bridge.createDomComponent({
        name: 'ElephantPhysicalSitesPanel',
        mount: (container) => this.render(container, true)
      })
    })
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sites',
      navigationLabel: 'Sites',
      navigationIcon: 'globe',
      standalone: true,
      chrome: false,
      title: 'Sites',
      description: 'Preview a static folder directly in Elephant on desktop, Android and iOS.',
      order: 50,
      render: (container) => this.render(container, false)
    })
  }

  onunload() {
    return this.stopPreview()
  }
}

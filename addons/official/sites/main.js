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
  if (parts.some((part) => part === '..' || part === '.')) throw new Error('Site folder must stay inside the active vault')
  return parts.join('/')
}

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.preview = null
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async resolveRoot(relativePath = '') {
    const state = await this.invoke('tauri_vaults_get')
    const base = String(state?.activeVault?.path || '').replace(/[\\/]+$/, '')
    if (!base) throw new Error('No active vault is available')
    const relative = normalizeRelativePath(relativePath)
    return relative ? `${base}/${relative}` : base
  }

  async openPreview(relativePath, method = 'preview.open') {
    await this.stopPreview().catch(() => {})
    const root = await this.resolveRoot(relativePath)
    this.preview = await this.api.native.call(method, { root })
    return this.preview
  }

  async refreshStatus() {
    if (!this.preview?.port) return { status: 'idle', running: false }
    const status = await this.api.native.call('preview.status', { port: this.preview.port })
    this.preview = { ...this.preview, ...status }
    return this.preview
  }

  async stopPreview() {
    if (!this.preview?.pid) {
      this.preview = null
      return { stopped: true }
    }
    const preview = this.preview
    this.preview = null
    return this.api.native.call('preview.stop', { pid: preview.pid }).catch(() => ({ stopped: false }))
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
    const build = node(documentRef, 'button', '', 'Build & preview')
    const stop = node(documentRef, 'button', '', 'Stop')
    const open = node(documentRef, 'button', '', 'Open')

    const renderStatus = async () => {
      const current = await this.refreshStatus().catch((error) => ({ status: 'error', error: error.message || String(error) }))
      status.textContent = current?.error || current?.status || (current?.running ? 'Running' : 'Idle')
      open.disabled = !current?.url || current?.running === false
      stop.disabled = !current?.pid || current?.running === false
    }

    const run = async (button, method) => {
      button.disabled = true
      status.textContent = method === 'site.build' ? 'Building…' : 'Starting preview…'
      try {
        await this.openPreview(folder.value, method)
        await renderStatus()
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        button.disabled = false
      }
    }

    preview.onclick = () => run(preview, 'preview.open')
    build.onclick = () => run(build, 'site.build')
    stop.onclick = async () => { await this.stopPreview(); await renderStatus() }
    open.onclick = () => this.openExternal(this.preview?.url)
    actions.append(preview, build, stop, open)
    root.append(node(documentRef, compact ? 'h4' : 'h3', '', 'Sites'), folder, actions, status)
    void renderStatus()
    return () => root.remove()
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
    `, 'sites-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.workspace.registerContribution('site.generators', {
      id: `${ADDON_ID}.generator`,
      title: 'Elephant Sites',
      description: 'Package-owned static site preview server.'
    })
    api.layout.registerZone({
      id: `${ADDON_ID}.preview-panel`,
      zone: 'workspace.notes',
      order: 80,
      component: bridge.createDomComponent({ name: 'ElephantPhysicalSitesPanel', mount: (container) => this.render(container, true) })
    })
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sites',
      navigationLabel: 'Sites',
      navigationIcon: 'globe',
      standalone: true,
      chrome: false,
      title: 'Sites',
      description: 'Preview a static folder through the package-owned native server.',
      order: 50,
      render: (container) => this.render(container, false)
    })
  }

  onunload() {
    return this.stopPreview()
  }
}

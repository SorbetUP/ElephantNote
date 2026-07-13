const ADDON_ID = 'elephant.sites'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.siteId = ''
    this.status = null
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  render(container, compact = false) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', compact ? 'elephant-sites-panel compact' : 'elephant-sites-panel')
    container.replaceChildren(root)
    const folder = node(documentRef, 'input')
    folder.placeholder = 'Folder to publish'
    const status = node(documentRef, 'p', 'elephant-sites-status', 'Idle')
    const actions = node(documentRef, 'div', 'elephant-sites-actions')
    const preview = node(documentRef, 'button', '', 'Preview')
    const build = node(documentRef, 'button', '', 'Build')
    const stop = node(documentRef, 'button', '', 'Stop')
    const open = node(documentRef, 'button', '', 'Open')

    const updateStatus = async () => {
      if (!this.siteId) { status.textContent = 'Idle'; return }
      this.status = await this.call('sites.status', { siteId: this.siteId }).catch((error) => ({ error: error.message || String(error) }))
      status.textContent = this.status?.error || this.status?.status || this.status?.state || 'Ready'
      open.disabled = !this.status?.url
    }

    preview.onclick = async () => {
      preview.disabled = true
      try {
        const result = await this.call('sites.previewFolder', { relativePath: folder.value.trim() })
        this.siteId = String(result?.siteId || result?.id || this.siteId)
        this.status = result
        await updateStatus()
      } finally { preview.disabled = false }
    }
    build.onclick = async () => {
      build.disabled = true
      try {
        const result = await this.call('sites.buildFolder', { relativePath: folder.value.trim() })
        this.siteId = String(result?.siteId || result?.id || this.siteId)
        this.status = result
        await updateStatus()
      } finally { build.disabled = false }
    }
    stop.onclick = async () => {
      if (this.siteId) await this.call('sites.stop', { siteId: this.siteId }).catch(() => {})
      this.siteId = ''; this.status = null; await updateStatus()
    }
    open.onclick = async () => {
      const url = this.status?.url
      if (url) await this.call('sites.openExternal', { url })
    }
    actions.append(preview, build, stop, open)
    root.append(node(documentRef, compact ? 'h4' : 'h3', '', 'Sites'), folder, actions, status)
    void updateStatus()
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
      description: 'Static site generator and preview service.'
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
      description: 'Generate and preview a static site.',
      order: 50,
      render: (container) => this.render(container, false)
    })
  }

  async onunload() {
    if (this.siteId) await this.call('sites.stop', { siteId: this.siteId }).catch(() => {})
    await this.call('features.set', { key: 'sitePreview', enabled: false }).catch(() => {})
  }
}

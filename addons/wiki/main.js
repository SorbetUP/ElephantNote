const ADDON_ID = 'elephant.wiki'
const VIEW_ID = `${ADDON_ID}.workspace`

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantWikiAddon {
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

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-wiki-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading Wiki…'))
      try {
        const result = await this.call('wiki.list')
        if (disposed) return
        const records = Array.isArray(result?.records) ? result.records : Array.isArray(result) ? result : []
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const heading = node(documentRef, 'div')
        heading.append(node(documentRef, 'h2', '', 'Wiki'), node(documentRef, 'p', '', `${records.length} pages and proposals`))
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const propose = node(documentRef, 'button', '', 'Generate proposals')
        propose.onclick = async () => { await this.call('wiki.propose'); await refresh() }
        const reload = node(documentRef, 'button', '', 'Refresh')
        reload.onclick = () => void refresh()
        actions.append(propose, reload)
        header.append(heading, actions)
        root.append(header)

        const list = node(documentRef, 'div', 'elephant-wiki-list')
        if (!records.length) list.append(node(documentRef, 'p', 'elephant-package-muted', 'No Wiki page or proposal yet.'))
        for (const record of records) {
          const article = node(documentRef, 'article', 'elephant-wiki-record')
          const title = String(record.title || record.name || record.id || 'Untitled Wiki page')
          article.append(node(documentRef, 'h3', '', title))
          const summary = String(record.summary || record.description || record.excerpt || '')
          if (summary) article.append(node(documentRef, 'p', '', summary))
          const meta = [record.status, `${record.sources?.length || record.sourceCount || 0} sources`].filter(Boolean).join(' · ')
          article.append(node(documentRef, 'small', '', meta))
          if (record.status === 'proposed' || record.proposed === true) {
            const buttons = node(documentRef, 'div', 'elephant-package-actions')
            const accept = node(documentRef, 'button', '', 'Approve')
            accept.onclick = async () => { await this.call('wiki.accept', { id: String(record.id) }); await refresh() }
            const dismiss = node(documentRef, 'button', '', 'Refuse')
            dismiss.onclick = async () => { await this.call('wiki.dismiss', { id: String(record.id) }); await refresh() }
            buttons.append(accept, dismiss)
            article.append(buttons)
          }
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
      .elephant-wiki-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:14px; padding:18px; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .elephant-package-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-wiki-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
      .elephant-wiki-record { display:grid; gap:8px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-wiki-record h3,.elephant-wiki-record p { margin:0; }
      .elephant-wiki-record p,.elephant-wiki-record small { color:var(--en-muted); }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'wiki-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Wiki',
      description: 'Browse AI-organized knowledge pages and proposals.',
      icon: 'book-open-text',
      kind: 'ai-wiki-v2',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalWiki', mount: (container) => this.render(container) }),
      order: 30
    })
  }
}

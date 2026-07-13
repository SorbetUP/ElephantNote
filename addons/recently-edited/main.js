const ADDON_ID = 'elephant.recently-edited'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantRecentlyEditedAddon {
  constructor(api) {
    this.api = api
  }

  render(container) {
    const documentRef = container.ownerDocument
    const pinia = this.api.app.pinia
    const vaultStore = pinia?._s?.get?.('elephantnoteVaults')
    if (!vaultStore) {
      container.textContent = 'Recently edited is unavailable until a vault is open.'
      return () => {}
    }

    let collapsed = false
    let showAll = false
    const root = node(documentRef, 'section', 'elephant-recent-notes')
    const heading = node(documentRef, 'button', 'elephant-recent-heading')
    heading.type = 'button'
    heading.append(
      node(documentRef, 'span', 'elephant-recent-icon', '◷'),
      node(documentRef, 'span', '', 'Recently edited'),
      node(documentRef, 'span', 'elephant-recent-chevron', '⌄')
    )
    const list = node(documentRef, 'div', 'elephant-recent-list')
    root.append(heading, list)
    container.replaceChildren(root)

    const render = () => {
      root.classList.toggle('collapsed', collapsed)
      list.hidden = collapsed
      list.replaceChildren()
      if (collapsed) return

      const notes = Array.from(vaultStore.recentNoteEntries || []).slice(0, 8)
      const visible = showAll ? notes : notes.slice(0, 5)
      for (const note of visible) {
        const button = node(documentRef, 'button', 'elephant-recent-note', String(note.title || 'Untitled'))
        button.type = 'button'
        button.title = String(note.path || '')
        button.classList.toggle('active', note.path === vaultStore.openedNotePath)
        button.addEventListener('click', () => vaultStore.openNote?.(note))
        list.append(button)
      }
      if (!notes.length) list.append(node(documentRef, 'p', 'elephant-recent-empty', 'No recent notes'))
      if (notes.length > 5) {
        const more = node(documentRef, 'button', 'elephant-recent-more', showAll ? 'Show less' : 'Show more')
        more.type = 'button'
        more.addEventListener('click', () => {
          showAll = !showAll
          render()
        })
        list.append(more)
      }
    }

    heading.addEventListener('click', () => {
      collapsed = !collapsed
      render()
    })
    render()
    const timer = setInterval(render, 1200)
    return () => {
      clearInterval(timer)
      root.remove()
    }
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-recent-notes { display:flex; flex-direction:column; gap:6px; margin-top:auto; border-top:1px solid var(--en-border); padding:10px 8px 8px; }
      .elephant-recent-heading,.elephant-recent-note,.elephant-recent-more { width:100%; min-height:32px; border:0; border-radius:6px; padding:0 8px; color:var(--en-muted); background:transparent; font:inherit; text-align:left; cursor:pointer; }
      .elephant-recent-heading { display:grid; grid-template-columns:16px minmax(0,1fr) 16px; align-items:center; gap:7px; color:var(--en-text); font-size:12px; font-weight:600; }
      .elephant-recent-chevron { transition:transform .16s ease; }
      .elephant-recent-notes.collapsed .elephant-recent-chevron { transform:rotate(-90deg); }
      .elephant-recent-list { display:flex; flex-direction:column; gap:1px; }
      .elephant-recent-note { display:block; min-height:30px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
      .elephant-recent-note:hover,.elephant-recent-note.active { color:var(--en-text); background:var(--en-soft); }
      .elephant-recent-more { color:var(--en-muted); font-size:12px; }
      .elephant-recent-empty { margin:0; padding:6px 8px; color:var(--en-muted); font-size:12px; }
    `, 'recently-edited-package')

    const bridge = api.experimental.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    const component = bridge.createDomComponent({
      name: 'ElephantPhysicalRecentlyEdited',
      className: 'elephant-physical-recently-edited-host',
      mount: (container) => this.render(container)
    })

    api.layout.registerZone({
      id: `${ADDON_ID}.sidebar-section`,
      zone: 'sidebar.after-tree',
      order: 100,
      component
    })
  }
}

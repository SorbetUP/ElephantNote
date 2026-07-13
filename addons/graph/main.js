const ADDON_ID = 'elephant.graph'
const VIEW_ID = `${ADDON_ID}.workspace`

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantGraphAddon {
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

  renderGraph(documentRef, graph, root) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
    const edges = Array.isArray(graph?.edges) ? graph.edges : []
    const width = Math.max(720, root.clientWidth || 900)
    const height = Math.max(520, root.clientHeight || 640)
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.classList.add('elephant-graph-svg')
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.max(150, Math.min(width, height) * 0.38)
    const positioned = new Map()
    nodes.forEach((item, index) => {
      const angle = nodes.length ? (index / nodes.length) * Math.PI * 2 : 0
      positioned.set(String(item.id), {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        item
      })
    })

    for (const edge of edges) {
      const source = positioned.get(String(edge.source))
      const target = positioned.get(String(edge.target))
      if (!source || !target) continue
      const line = documentRef.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', source.x); line.setAttribute('y1', source.y)
      line.setAttribute('x2', target.x); line.setAttribute('y2', target.y)
      line.setAttribute('class', 'elephant-graph-edge')
      svg.append(line)
    }

    for (const { x, y, item } of positioned.values()) {
      const group = documentRef.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('class', 'elephant-graph-node')
      group.setAttribute('transform', `translate(${x} ${y})`)
      const circle = documentRef.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', item.kind === 'wiki' ? '8' : '6')
      const label = documentRef.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', '10'); label.setAttribute('y', '4')
      label.textContent = String(item.label || item.title || item.id || 'Node').slice(0, 48)
      group.append(circle, label)
      group.addEventListener('click', () => {
        const path = item.relativePath || item.path
        if (path) this.window.dispatchEvent(new CustomEvent('elephantnote:open-note', { detail: { path } }))
      })
      svg.append(group)
    }
    root.append(svg)
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-graph-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading graph…'))
      try {
        let result = await this.call('search.inspect')
        if (!result?.graph?.nodes?.length) {
          await this.call('search.rebuild').catch(() => null)
          result = await this.call('search.inspect')
        }
        if (disposed) return
        root.replaceChildren()
        const graph = result?.graph || { nodes: [], edges: [] }
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Graph'), node(documentRef, 'p', '', `${graph.nodes?.length || 0} nodes · ${graph.edges?.length || 0} edges`))
        const button = node(documentRef, 'button', '', 'Rebuild')
        button.onclick = async () => { await this.call('search.rebuild'); await refresh() }
        header.append(copy, button)
        root.append(header)
        if (!graph.nodes?.length) root.append(node(documentRef, 'p', 'elephant-package-muted', 'No indexed relationship yet.'))
        else this.renderGraph(documentRef, graph, root)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-package-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-graph-package { height:100%; min-height:480px; display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; padding:16px; box-sizing:border-box; overflow:hidden; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-header button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-graph-svg { width:100%; height:100%; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-graph-edge { stroke:var(--en-border); stroke-width:1; opacity:.8; }
      .elephant-graph-node { cursor:pointer; }
      .elephant-graph-node circle { fill:var(--en-accent,#4f46e5); stroke:var(--en-surface); stroke-width:2; }
      .elephant-graph-node text { fill:var(--en-text); font-size:11px; }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'graph-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Graph',
      description: 'Explore note, Wiki and semantic relationships.',
      icon: 'git-fork',
      kind: 'ai-graph-v2',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalGraph', mount: (container) => this.render(container) }),
      order: 35
    })
    api.commands.register({
      id: `${ADDON_ID}.open`,
      title: 'Open graph',
      run: () => api.workspace.openView(VIEW_ID)
    })
  }
}

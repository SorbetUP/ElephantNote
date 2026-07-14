const ADDON_ID = 'elephant.graph'
const VIEW_ID = `${ADDON_ID}.workspace`
const MAX_NOTES = 800
const KNOWLEDGE_RESOURCE = 'knowledge.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const normalizeTarget = (value = '') => String(value || '')
  .trim()
  .replaceAll('\\', '/')
  .replace(/\.md$/i, '')
  .replace(/^\/+|\/+$/g, '')
  .toLowerCase()

const titleFromPath = (path = '') => (String(path).split('/').pop() || 'Untitled')
  .replace(/\.md$/i, '')
  .replace(/[-_]+/g, ' ')

const extractTitle = (content, path) => String(content || '').match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromPath(path)
const extractLinks = (content = '') => [...String(content).matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
  .map((match) => normalizeTarget(match[1]))
  .filter(Boolean)
const extractTags = (content = '') => [...new Set([...String(content).matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,})/gu)].map((match) => match[2].toLowerCase()))]

const hashAngle = (value) => {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

export default class ElephantGraphAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.cachedGraph = null
  }

  knowledgeProvider() {
  return this.api.resources.get(KNOWLEDGE_RESOURCE)
}

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  broker(method, params = {}) {
    return this.invoke('tauri_addons_call', { addonId: ADDON_ID, method, params })
  }

  async readNotes() {
    const entries = await this.invoke('tauri_addons_notes_list', { addonId: ADDON_ID, prefix: '.' })
    const notes = []
    for (const entry of (Array.isArray(entries) ? entries : []).slice(0, MAX_NOTES)) {
      try {
        const result = await this.broker('notes.read', { path: entry.path })
        const content = String(result?.content || '')
        notes.push({
          id: normalizeTarget(entry.path),
          path: String(entry.path),
          title: extractTitle(content, entry.path),
          kind: String(entry.path).startsWith('Wiki/') ? 'wiki' : 'note',
          links: extractLinks(content),
          tags: extractTags(content)
        })
      } catch (error) {
        console.warn('[graph-addon] note skipped', { path: entry?.path, error: error?.message || String(error) })
      }
    }
    return notes
  }

  async buildGraph() {
  const knowledge = this.knowledgeProvider()
  if (knowledge && typeof knowledge.graph === 'function') {
    try {
      const projection = await knowledge.graph({ includeSuggestions: true })
      const edges = (Array.isArray(projection?.edges) ? projection.edges : []).map((edge) => ({
        ...edge,
        kind: edge.kind || edge.type || edge.relationType || 'relation',
        weight: Number(edge.weight) || 1
      }))
      const degree = new Map()
      for (const edge of edges) {
        degree.set(String(edge.source), (degree.get(String(edge.source)) || 0) + 1)
        degree.set(String(edge.target), (degree.get(String(edge.target)) || 0) + 1)
      }
      const nodes = (Array.isArray(projection?.nodes) ? projection.nodes : []).map((item) => ({
        ...item,
        label: item.label || item.title || item.id,
        relativePath: item.relativePath || item.relative_path || item.path,
        path: item.path || item.relativePath || item.relative_path,
        kind: item.kind || item.type || 'note',
        degree: degree.get(String(item.id)) || 0
      }))
      this.cachedGraph = {
        ...projection,
        nodes,
        edges,
        generatedAt: new Date().toISOString(),
        engine: 'knowledge-provider'
      }
      return this.cachedGraph
    } catch (error) {
      console.warn('[graph-addon] Knowledge projection failed; using local fallback', error)
    }
  }

    const notes = await this.readNotes()
    const byId = new Map()
    const aliases = new Map()
    for (const note of notes) {
      byId.set(note.id, note)
      aliases.set(normalizeTarget(note.title), note.id)
      aliases.set(normalizeTarget(note.path), note.id)
      aliases.set(normalizeTarget(note.path.split('/').pop()), note.id)
    }

    const edgeIds = new Set()
    const edges = []
    const addEdge = (source, target, kind, weight = 1) => {
      if (!source || !target || source === target || !byId.has(source) || !byId.has(target)) return
      const ordered = source < target ? `${source}|${target}` : `${target}|${source}`
      const id = `${kind}:${ordered}`
      if (edgeIds.has(id)) return
      edgeIds.add(id)
      edges.push({ id, source, target, kind, weight })
    }

    for (const note of notes) {
      for (const target of note.links) addEdge(note.id, aliases.get(target) || target, 'link', 3)
    }

    const tagBuckets = new Map()
    for (const note of notes) {
      for (const tag of note.tags) {
        if (!tagBuckets.has(tag)) tagBuckets.set(tag, [])
        tagBuckets.get(tag).push(note.id)
      }
    }
    for (const ids of tagBuckets.values()) {
      const limited = ids.slice(0, 40)
      for (let index = 1; index < limited.length; index += 1) addEdge(limited[index - 1], limited[index], 'tag', 1)
    }

    const nodes = notes.map((note) => ({
      id: note.id,
      label: note.title,
      title: note.title,
      relativePath: note.path,
      path: note.path,
      kind: note.kind,
      degree: edges.reduce((count, edge) => count + Number(edge.source === note.id || edge.target === note.id), 0)
    }))
    this.cachedGraph = { nodes, edges, generatedAt: new Date().toISOString() }
    return this.cachedGraph
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
    const count = Math.max(1, nodes.length)
    nodes.forEach((item, index) => {
      const spread = Math.min(1, Math.max(0.2, (item.degree || 1) / 12))
      const angle = hashAngle(item.id) + (index / count) * Math.PI * 0.25
      const nodeRadius = radius * (0.35 + (1 - spread) * 0.65)
      positioned.set(String(item.id), {
        x: centerX + Math.cos(angle) * nodeRadius,
        y: centerY + Math.sin(angle) * nodeRadius,
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
      line.setAttribute('class', `elephant-graph-edge kind-${edge.kind || 'link'}`)
      line.setAttribute('stroke-width', String(Math.min(3, Math.max(1, edge.weight || 1))))
      svg.append(line)
    }

    for (const { x, y, item } of positioned.values()) {
      const group = documentRef.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('class', `elephant-graph-node kind-${item.kind || 'note'}`)
      group.setAttribute('transform', `translate(${x} ${y})`)
      const circle = documentRef.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', String(Math.min(13, 6 + Math.sqrt(Math.max(0, item.degree || 0)))))
      const label = documentRef.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', '12'); label.setAttribute('y', '4')
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

    const refresh = async (force = false) => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Building graph…'))
      try {
        const graph = !force && this.cachedGraph ? this.cachedGraph : await this.buildGraph()
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Graph'), node(documentRef, 'p', '', `${graph.nodes.length} nodes · ${graph.edges.length} edges`))
        const button = node(documentRef, 'button', '', 'Rebuild')
        button.onclick = async () => { button.disabled = true; try { await refresh(true) } finally { button.disabled = false } }
        header.append(copy, button)
        root.append(header)
        if (!graph.nodes.length) root.append(node(documentRef, 'p', 'elephant-package-muted', 'No note relationship yet.'))
        else this.renderGraph(documentRef, graph, root)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-package-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh(false)
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
      .elephant-graph-edge { stroke:var(--en-border); opacity:.75; }
      .elephant-graph-edge.kind-tag { stroke-dasharray:3 4; opacity:.45; }
      .elephant-graph-node { cursor:pointer; }
      .elephant-graph-node circle { fill:var(--en-accent,#4f46e5); stroke:var(--en-surface); stroke-width:2; }
      .elephant-graph-node.kind-wiki circle { fill:var(--en-success,#12b76a); }
      .elephant-graph-node text { fill:var(--en-text); font-size:11px; }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'graph-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Graph',
      description: 'Explore package-owned note and Wiki relationships.',
      icon: 'git-fork',
      kind: 'ai-graph-v3',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalGraph', mount: (container) => this.render(container) }),
      order: 35
    })
    api.commands.register({
      id: `${ADDON_ID}.open`,
      title: 'Open graph',
      run: () => api.workspace.openView(VIEW_ID)
    })
    api.commands.register({
      id: `${ADDON_ID}.rebuild`,
      title: 'Rebuild graph',
      run: () => this.buildGraph()
    })
  }
}

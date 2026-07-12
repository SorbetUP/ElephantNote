from pathlib import Path

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    write(path, content.replace(old, new, 1))


internal_links = r'''const EXTERNAL_PROTOCOL_RE = /^(?:https?:|mailto:|tel:|data:|javascript:|file:)/i
const MARKDOWN_PATH_RE = /\.md$/i

const decodeComponent = (value = '') => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const normalizeVaultPath = (value = '') => {
  const parts = []
  for (const part of String(value || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return ''
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

const parentPath = (value = '') => {
  const normalized = normalizeVaultPath(value)
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export const markdownAnchorSlug = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')

export const resolveInternalNoteLink = ({
  href = '',
  currentNotePath = '',
  appOrigin = globalThis.location?.origin || ''
} = {}) => {
  const raw = String(href || '').trim()
  const current = normalizeVaultPath(currentNotePath)
  if (!raw || !current) return null

  if (raw.startsWith('#')) {
    return { path: current, anchor: decodeComponent(raw.slice(1)) }
  }

  let pathPart = raw
  let anchor = ''

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (EXTERNAL_PROTOCOL_RE.test(raw)) {
      let parsed
      try {
        parsed = new URL(raw)
      } catch {
        return null
      }
      if (!appOrigin || parsed.origin !== appOrigin) return null
      pathPart = parsed.pathname.replace(/^\/+/, '')
      anchor = decodeComponent(parsed.hash.replace(/^#/, ''))
    } else {
      return null
    }
  } else {
    const hashIndex = raw.indexOf('#')
    if (hashIndex >= 0) {
      anchor = decodeComponent(raw.slice(hashIndex + 1))
      pathPart = raw.slice(0, hashIndex)
    }
    pathPart = pathPart.split('?')[0]
  }

  pathPart = decodeComponent(pathPart).replace(/\\/g, '/')
  if (!MARKDOWN_PATH_RE.test(pathPart)) return null

  const path = pathPart.startsWith('/')
    ? normalizeVaultPath(pathPart.replace(/^\/+/, ''))
    : normalizeVaultPath(`${parentPath(current)}/${pathPart}`)
  if (!path || !MARKDOWN_PATH_RE.test(path)) return null

  return { path, anchor }
}

const headingCandidates = () => [
  ...document.querySelectorAll('.en-editor-host h1, .en-editor-host h2, .en-editor-host h3, .en-editor-host h4, .en-editor-host h5, .en-editor-host h6, .en-editor-host [data-block-type="heading"]')
]

const scrollToAnchor = (anchor, attempt = 0) => {
  if (!anchor || attempt > 24) return
  const decoded = decodeComponent(anchor)
  const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(decoded) : decoded.replace(/["\\]/g, '\\$&')
  const exact = document.querySelector(`#${escaped}, [name="${escaped}"], [data-id="${escaped}"]`)
  const slug = markdownAnchorSlug(decoded)
  const target = exact || headingCandidates().find((element) => markdownAnchorSlug(element.textContent) === slug)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  window.setTimeout(() => scrollToAnchor(anchor, attempt + 1), 60)
}

export const handleEditorInternalLinkClick = (event, store) => {
  if (!event || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  const anchorElement = event.target?.closest?.('a[href]')
  if (!anchorElement) return false
  const resolved = resolveInternalNoteLink({
    href: anchorElement.getAttribute('href') || anchorElement.href,
    currentNotePath: store?.openedNotePath || '',
    appOrigin: globalThis.location?.origin || ''
  })
  if (!resolved) return false

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()

  if (resolved.path !== store.openedNotePath) {
    store.openNote({
      path: resolved.path,
      title: resolved.path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
      kind: 'note',
      type: 'note'
    })
  }
  if (resolved.anchor) scrollToAnchor(resolved.anchor)
  return true
}
'''
write('Elephant/frontend/app/components/editor/internalNoteLinks.js', internal_links)

note_editor = 'Elephant/frontend/app/components/editor/NoteEditorHost.vue'
replace_once(
    note_editor,
    '<div class="en-editor-host">',
    '<div\n          class="en-editor-host"\n          @click.capture="handleEditorLinkClick"\n        >'
)
replace_once(
    note_editor,
    "import { parseMarkdownTags, updateMarkdownTags } from '../../utils/markdownTags'",
    "import { parseMarkdownTags, updateMarkdownTags } from '../../utils/markdownTags'\nimport { handleEditorInternalLinkClick } from './internalNoteLinks'"
)
replace_once(
    note_editor,
    "const currentNoteDirectory = computed(() => {",
    "const handleEditorLinkClick = (event) => handleEditorInternalLinkClick(event, store)\n\nconst currentNoteDirectory = computed(() => {"
)

helper = 'Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'
replace_once(
    helper,
    "const VISIBLE_KNOWLEDGE_EDGE_TYPES = new Set([\n  'semantic',\n  'explicit-link',\n  'wiki-source',\n  'wiki-link'\n])",
    "const VISIBLE_KNOWLEDGE_EDGE_TYPES = new Set([\n  'semantic',\n  'explicit-link',\n  'wiki-source',\n  'wiki-link'\n])\nconst WIKI_LAYOUT_EDGE_TYPES = new Set(['wiki-source', 'wiki-link'])\n\nconst stableLayoutHash = (value = '') => {\n  let hash = 2166136261\n  for (const character of String(value)) {\n    hash ^= character.charCodeAt(0)\n    hash = Math.imul(hash, 16777619)\n  }\n  return hash >>> 0\n}\n\nconst applyWikiKnowledgeLayout = ({ nodes = [], edges = [], width = 1800, height = 1200 } = {}) => {\n  const byId = new Map(nodes.map((node) => [node.id, node]))\n  const wikiNodes = nodes.filter((node) => (node.kind || node.type) === 'wiki')\n  if (!wikiNodes.length) return nodes\n\n  const sourceIdsByWiki = new Map(wikiNodes.map((node) => [node.id, []]))\n  const boundIds = new Set(wikiNodes.map((node) => node.id))\n  for (const edge of edges) {\n    if (edge.type !== 'wiki-source') continue\n    const sourceNode = byId.get(edge.source)\n    const targetNode = byId.get(edge.target)\n    const wikiId = (sourceNode?.kind || sourceNode?.type) === 'wiki'\n      ? edge.source\n      : (targetNode?.kind || targetNode?.type) === 'wiki' ? edge.target : ''\n    const noteId = wikiId === edge.source ? edge.target : edge.source\n    if (!wikiId || !byId.has(noteId)) continue\n    sourceIdsByWiki.get(wikiId)?.push(noteId)\n    boundIds.add(noteId)\n  }\n\n  const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]))\n  if (wikiNodes.length === 1) {\n    positions.set(wikiNodes[0].id, { x: width / 2, y: height / 2 })\n  }\n\n  const proposed = new Map()\n  for (const wiki of wikiNodes.sort((left, right) => String(left.id).localeCompare(String(right.id)))) {\n    const center = positions.get(wiki.id) || { x: width / 2, y: height / 2 }\n    const sourceIds = [...new Set(sourceIdsByWiki.get(wiki.id) || [])]\n      .sort((left, right) => String(byId.get(left)?.title || left).localeCompare(String(byId.get(right)?.title || right)))\n    const perRing = 12\n    sourceIds.forEach((id, index) => {\n      const ring = Math.floor(index / perRing)\n      const ringItems = Math.min(perRing, sourceIds.length - ring * perRing)\n      const angle = -Math.PI / 2 + (Math.PI * 2 * (index % perRing)) / Math.max(1, ringItems)\n      const radius = 78 + ring * 42\n      const target = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }\n      if (!proposed.has(id)) proposed.set(id, [])\n      proposed.get(id).push(target)\n    })\n\n    const protectedRadius = 150 + Math.max(0, Math.ceil(sourceIds.length / perRing) - 1) * 42\n    for (const node of nodes) {\n      if (boundIds.has(node.id)) continue\n      const point = positions.get(node.id)\n      if (!point) continue\n      const dx = point.x - center.x\n      const dy = point.y - center.y\n      const distance = Math.hypot(dx, dy)\n      if (distance >= protectedRadius) continue\n      const angle = distance > 1\n        ? Math.atan2(dy, dx)\n        : ((stableLayoutHash(node.id) % 360) / 180) * Math.PI\n      const radius = protectedRadius + 18 + (stableLayoutHash(node.id) % 46)\n      positions.set(node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })\n    }\n  }\n\n  for (const [id, targets] of proposed.entries()) {\n    const point = targets.reduce((output, target) => ({ x: output.x + target.x, y: output.y + target.y }), { x: 0, y: 0 })\n    positions.set(id, { x: point.x / targets.length, y: point.y / targets.length })\n  }\n\n  return nodes.map((node) => ({ ...node, ...(positions.get(node.id) || {}) }))\n}"
)
replace_once(
    helper,
    "  positionedNodes.sort((a, b) => {\n    if ((a.kind || a.type) !== (b.kind || b.type)) {\n      return (a.kind || a.type) === 'folder' ? -1 : 1\n    }\n    return String(a.title || '').localeCompare(String(b.title || ''))\n  })\n\n  const edgeCounts = new Map()",
    "  positionedNodes.sort((a, b) => {\n    if ((a.kind || a.type) !== (b.kind || b.type)) {\n      return (a.kind || a.type) === 'folder' ? -1 : 1\n    }\n    return String(a.title || '').localeCompare(String(b.title || ''))\n  })\n  const knowledgePositionedNodes = applyWikiKnowledgeLayout({ nodes: positionedNodes, edges, width, height })\n\n  const edgeCounts = new Map()"
)
replace_once(helper, '  for (const node of positionedNodes) {\n    atomCluster.set(node.id, node.clusterId)\n  }', '  for (const node of knowledgePositionedNodes) {\n    atomCluster.set(node.id, node.clusterId)\n  }')
replace_once(helper, '    nodes: positionedNodes,', '    nodes: knowledgePositionedNodes,')
replace_once(
    helper,
    "  const base = cached.base\n  const hasSavedPositions = savedPositions && Object.keys(savedPositions).length > 0",
    "  const base = cached.base\n  const knowledgeBoundIds = new Set(\n    base.edges\n      .filter((edge) => WIKI_LAYOUT_EDGE_TYPES.has(edge.type))\n      .flatMap((edge) => [edge.source, edge.target])\n  )\n  const hasSavedPositions = savedPositions && Object.keys(savedPositions).length > 0"
)
replace_once(
    helper,
    "      const saved = savedPositions[node.id]\n      if (!saved) return node",
    "      if (knowledgeBoundIds.has(node.id)) return node\n      const saved = savedPositions[node.id]\n      if (!saved) return node"
)

atomic = 'Elephant/frontend/app/components/views/AtomicGraphView.vue'
replace_once(
    atomic,
    "  if (type === 'explicit-link') return '#3b9b96'\n  if (type === 'folder') return '#d98a3b'",
    "  if (type === 'explicit-link') return '#3b9b96'\n  if (type === 'wiki-source') return '#d98545'\n  if (type === 'wiki-link') return '#e8b15a'\n  if (type === 'folder') return '#d98a3b'"
)
replace_once(
    atomic,
    "    const baseSize = 3 + connectivity * 6 + (node.kind === 'folder' ? 3 : 0)\n    graph.addNode(id, {\n      x: node.x,\n      y: node.y,\n      size: baseSize,\n      color: nodeColor(t, Math.min(1, 0.3 + connectivity), clusterIdx),",
    "    const isWiki = node.kind === 'wiki'\n    const baseSize = 3 + connectivity * 6 + (node.kind === 'folder' ? 3 : 0) + (isWiki ? 5 : 0)\n    graph.addNode(id, {\n      x: node.x,\n      y: node.y,\n      size: baseSize,\n      color: isWiki ? '#d98545' : nodeColor(t, Math.min(1, 0.3 + connectivity), clusterIdx),"
)
replace_once(
    atomic,
    "      graphInstance.forEachEdge((edge, _attrs, s, t) => {\n        const a = graphInstance.getNodeAttributes(s)\n        const b = graphInstance.getNodeAttributes(t)\n        const dx = b.x - a.x\n        const dy = b.y - a.y\n        const dist = Math.sqrt(dx * dx + dy * dy) || 1\n        const f = forceLink.value * (dist - forceLinkDistance.value) * damping",
    "      graphInstance.forEachEdge((edge, attrs, s, t) => {\n        const a = graphInstance.getNodeAttributes(s)\n        const b = graphInstance.getNodeAttributes(t)\n        const dx = b.x - a.x\n        const dy = b.y - a.y\n        const dist = Math.sqrt(dx * dx + dy * dy) || 1\n        const knowledgeEdge = attrs.edgeType === 'wiki-source' || attrs.edgeType === 'wiki-link'\n        const desiredDistance = knowledgeEdge ? Math.min(78, forceLinkDistance.value) : forceLinkDistance.value\n        const strength = forceLink.value * (knowledgeEdge ? 2.4 : 1)\n        const f = strength * (dist - desiredDistance) * damping"
)

wiki_graph_test = r'''import { describe, expect, it } from 'vitest'

import {
  buildSemanticGraphSurface,
  buildSemanticViewModel
} from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'

describe('Wiki graph surface', () => {
  const graph = {
    nodes: [
      {
        id: 'wiki:one',
        path: '.elephantnote/wiki/wiki-one.md',
        relativePath: '.elephantnote/wiki/wiki-one.md',
        kind: 'wiki',
        title: 'Wiki one'
      },
      { id: 'Notes/A.md', path: 'Notes/A.md', relativePath: 'Notes/A.md', kind: 'note', title: 'A' },
      { id: 'Notes/B.md', path: 'Notes/B.md', relativePath: 'Notes/B.md', kind: 'note', title: 'B' },
      { id: 'Other/C.md', path: 'Other/C.md', relativePath: 'Other/C.md', kind: 'note', title: 'C' }
    ],
    edges: [
      { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },
      { source: 'wiki:one', target: 'Notes/B.md', edge_type: 'wiki-source' }
    ],
    clusters: [
      { id: 'wiki:one', label: 'Wiki one', paths: ['wiki:one', 'Notes/A.md', 'Notes/B.md'] }
    ]
  }

  it('preserves backend Wiki node identities and keeps their edges visible', () => {
    const surface = buildSemanticGraphSurface({ graph })
    expect(surface.nodes.map((node) => node.id)).toEqual(['wiki:one', 'Notes/A.md', 'Notes/B.md', 'Other/C.md'])
    expect(surface.nodeMap.get('wiki:one')?.relativePath).toBe('.elephantnote/wiki/wiki-one.md')
    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-source'])
    expect(surface.edgeCounts.get('wiki:one')).toBe(2)
    expect(surface.clusters[0]?.paths).toContain('wiki:one')
  })

  it('places Wiki sources close to their Wiki and ignores stale saved positions for linked nodes', () => {
    const model = buildSemanticViewModel({
      graph,
      width: 1200,
      height: 800,
      savedPositions: {
        'wiki:one': { x: 20, y: 20 },
        'Notes/A.md': { x: 1800, y: 1200 },
        'Notes/B.md': { x: -900, y: -600 },
        'Other/C.md': { x: 33, y: 44 }
      }
    })
    const byId = new Map(model.nodes.map((node) => [node.id, node]))
    const wiki = byId.get('wiki:one')
    const sourceA = byId.get('Notes/A.md')
    const sourceB = byId.get('Notes/B.md')
    const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y)

    expect(wiki.x).toBeCloseTo(600)
    expect(wiki.y).toBeCloseTo(400)
    expect(distance(wiki, sourceA)).toBeLessThan(120)
    expect(distance(wiki, sourceB)).toBeLessThan(120)
    expect(sourceA.x).not.toBe(1800)
    expect(byId.get('Other/C.md')).toMatchObject({ x: 33, y: 44 })
  })
})
'''
write('tests/app/unit/wikiGraphSurface.spec.js', wiki_graph_test)

internal_link_test = r'''import { describe, expect, it } from 'vitest'

import {
  markdownAnchorSlug,
  resolveInternalNoteLink
} from '../../../Elephant/frontend/app/components/editor/internalNoteLinks.js'

describe('internal Wiki note links', () => {
  it('resolves a generated Wiki citation relative to the hidden Wiki file', () => {
    expect(resolveInternalNoteLink({
      href: '../../Notes/Iroh%20guide.md#direct-connections',
      currentNotePath: '.elephantnote/wiki/iroh.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toEqual({ path: 'Notes/Iroh guide.md', anchor: 'direct-connections' })
  })

  it('accepts same-origin rendered markdown URLs but rejects external pages', () => {
    expect(resolveInternalNoteLink({
      href: 'http://127.0.0.1:1420/Notes/A.md#part-one',
      currentNotePath: '.elephantnote/wiki/topic.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toEqual({ path: 'Notes/A.md', anchor: 'part-one' })
    expect(resolveInternalNoteLink({
      href: 'https://example.com/Notes/A.md',
      currentNotePath: '.elephantnote/wiki/topic.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toBeNull()
  })

  it('normalizes heading anchors consistently', () => {
    expect(markdownAnchorSlug('Direct connections & Réseau')).toBe('direct-connections-reseau')
  })
})
'''
write('tests/app/unit/internalNoteLinks.spec.js', internal_link_test)

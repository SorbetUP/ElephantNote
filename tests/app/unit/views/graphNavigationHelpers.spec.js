import { describe, expect, it } from 'vitest'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  buildSemanticNeighborhood,
  fitCameraToNodes,
  focusCameraOnNode,
  layoutSemanticNeighborhood,
  layoutWikiTerritories,
  pushSemanticHistory,
  zoomCameraAtPoint
} from '../../../../Elephant/frontend/app/components/views/graphNavigationHelpers.js'

const nodes = [
  { id: 'A.md', title: 'A', kind: 'note' },
  { id: 'B.md', title: 'B', kind: 'note' },
  { id: 'C.md', title: 'C', kind: 'note' },
  { id: 'D.md', title: 'D', kind: 'note' },
  { id: 'E.md', title: 'E', kind: 'note' }
]

const edges = [
  { source: 'A.md', target: 'B.md', type: 'explicit-link', weight: 1 },
  { source: 'A.md', target: 'C.md', type: 'semantic', weight: 0.8 },
  { source: 'B.md', target: 'D.md', type: 'semantic', weight: 0.7 },
  { source: 'C.md', target: 'E.md', type: 'semantic', weight: 0.6 }
]

describe('graph semantic navigation', () => {
  it('builds an exact one-hop neighborhood', () => {
    const graph = buildSemanticNeighborhood({ nodes, edges, centerId: 'A.md', depth: 1 })

    expect(graph.center.id).toBe('A.md')
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['A.md', 'B.md', 'C.md'])
    expect(graph.edges).toHaveLength(2)
    expect(graph.distances.get('A.md')).toBe(0)
    expect(graph.distances.get('B.md')).toBe(1)
    expect(graph.distances.has('D.md')).toBe(false)
  })

  it('expands deterministically to depth two', () => {
    const graph = buildSemanticNeighborhood({ nodes, edges, centerId: 'A.md', depth: 2 })

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['A.md', 'B.md', 'C.md', 'D.md', 'E.md'])
    expect(graph.distances.get('D.md')).toBe(2)
    expect(graph.distances.get('E.md')).toBe(2)
  })

  it('places the center and concentric depths predictably', () => {
    const graph = buildSemanticNeighborhood({ nodes, edges, centerId: 'A.md', depth: 2 })
    const layout = layoutSemanticNeighborhood({
      nodes: graph.nodes,
      edges: graph.edges,
      centerId: 'A.md',
      distances: graph.distances
    })
    const byId = new Map(layout.map((node) => [node.id, node]))

    expect(byId.get('A.md')).toMatchObject({ x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2, depth: 0 })
    expect(byId.get('B.md').depth).toBe(1)
    expect(byId.get('D.md')).toMatchObject({ depth: 2, parentId: 'B.md' })
    expect(byId.get('E.md')).toMatchObject({ depth: 2, parentId: 'C.md' })
  })

  it('truncates forward history when navigating from the past', () => {
    const first = pushSemanticHistory({ history: [], index: -1, nodeId: 'A.md' })
    const second = pushSemanticHistory({ ...first, nodeId: 'B.md' })
    const branched = pushSemanticHistory({ history: second.history, index: 0, nodeId: 'C.md' })

    expect(branched).toEqual({ history: ['A.md', 'C.md'], index: 1 })
  })
})

describe('Wiki territory layout', () => {
  const territoryNodes = [
    { id: 'wiki:one', title: 'Wiki One', kind: 'wiki' },
    { id: 'wiki:two', title: 'Wiki Two', kind: 'wiki' },
    { id: 'A.md', title: 'A', kind: 'note' },
    { id: 'Shared.md', title: 'Shared', kind: 'note' },
    { id: 'B.md', title: 'B', kind: 'note' },
    { id: 'Orphan.md', title: 'Orphan', kind: 'note' }
  ]
  const territoryEdges = [
    { source: 'wiki:one', target: 'A.md', type: 'wiki-source', weight: 1 },
    { source: 'wiki:one', target: 'Shared.md', type: 'wiki-source', weight: 1 },
    { source: 'wiki:two', target: 'Shared.md', type: 'wiki-source', weight: 1 },
    { source: 'wiki:two', target: 'B.md', type: 'wiki-source', weight: 1 },
    { source: 'wiki:one', target: 'wiki:two', type: 'wiki-link', weight: 1 }
  ]
  const clusters = [
    {
      id: 'wiki:one',
      label: 'Wiki One',
      paths: ['wiki:one', 'A.md', 'Shared.md'],
      tags: ['wiki-territory', 'status:accepted']
    },
    {
      id: 'wiki:two',
      label: 'Wiki Two',
      paths: ['wiki:two', 'Shared.md', 'B.md'],
      tags: ['wiki-territory', 'status:outdated']
    },
    {
      id: 'unassigned',
      label: 'Unassigned notes',
      paths: ['Orphan.md'],
      tags: ['unassigned-territory']
    }
  ]

  it('creates one soft envelope per Wiki plus the unassigned zone', () => {
    const layout = layoutWikiTerritories({ nodes: territoryNodes, edges: territoryEdges, clusters })

    expect(layout.territories).toHaveLength(3)
    expect(layout.stats).toMatchObject({
      territoryCount: 2,
      overlapNotes: 1,
      unassignedNotes: 1,
      bridgeCount: 1
    })
    for (const territory of layout.territories) {
      expect(territory.path.startsWith('M ')).toBe(true)
      expect(territory.bounds.maxX).toBeGreaterThan(territory.bounds.minX)
      expect(territory.bounds.maxY).toBeGreaterThan(territory.bounds.minY)
    }
  })

  it('places a shared note between both Wiki centers', () => {
    const layout = layoutWikiTerritories({ nodes: territoryNodes, edges: territoryEdges, clusters })
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const one = byId.get('wiki:one')
    const two = byId.get('wiki:two')
    const shared = byId.get('Shared.md')
    const midpoint = { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 }

    expect(layout.memberships.get('Shared.md').sort()).toEqual(['wiki:one', 'wiki:two'])
    expect(Math.hypot(shared.x - midpoint.x, shared.y - midpoint.y)).toBeLessThan(24)
  })

  it('keeps Wiki centers and all notes inside the viewport', () => {
    const layout = layoutWikiTerritories({ nodes: territoryNodes, edges: territoryEdges, clusters })

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x).toBeLessThanOrEqual(GRAPH_WIDTH)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeLessThanOrEqual(GRAPH_HEIGHT)
    }
  })

  it('falls back cleanly when no Wiki territory exists', () => {
    const layout = layoutWikiTerritories({ nodes, edges, clusters: [] })

    expect(layout.nodes).toEqual([])
    expect(layout.territories).toEqual([])
    expect(layout.stats.territoryCount).toBe(0)
  })
})

describe('graph camera calculations', () => {
  it('keeps the cursor world point stable while zooming', () => {
    const camera = { x: 40, y: 20, scale: 1 }
    const point = { x: 300, y: 200 }
    const before = {
      x: (point.x - camera.x) / camera.scale,
      y: (point.y - camera.y) / camera.scale
    }
    const zoomed = zoomCameraAtPoint({ camera, point, nextScale: 2 })
    const after = {
      x: (point.x - zoomed.x) / zoomed.scale,
      y: (point.y - zoomed.y) / zoomed.scale
    }

    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('centers a selected node at the requested zoom', () => {
    const camera = focusCameraOnNode({ node: { x: 120, y: 80 }, targetScale: 1.5 })

    expect(120 * camera.scale + camera.x).toBeCloseTo(GRAPH_WIDTH / 2)
    expect(80 * camera.scale + camera.y).toBeCloseTo(GRAPH_HEIGHT / 2)
    expect(camera.scale).toBe(1.5)
  })

  it('fits all visible nodes inside the graph viewport', () => {
    const visible = [
      { x: 100, y: 100 },
      { x: 700, y: 420 }
    ]
    const camera = fitCameraToNodes({ nodes: visible, padding: 60 })

    for (const node of visible) {
      const x = node.x * camera.scale + camera.x
      const y = node.y * camera.scale + camera.y
      expect(x).toBeGreaterThanOrEqual(55)
      expect(x).toBeLessThanOrEqual(GRAPH_WIDTH - 55)
      expect(y).toBeGreaterThanOrEqual(55)
      expect(y).toBeLessThanOrEqual(GRAPH_HEIGHT - 55)
    }
  })
})

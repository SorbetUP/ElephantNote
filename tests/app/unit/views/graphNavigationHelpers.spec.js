import { describe, expect, it } from 'vitest'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  buildSemanticNeighborhood,
  fitCameraToNodes,
  focusCameraOnNode,
  layoutSemanticNeighborhood,
  pushSemanticHistory,
  zoomCameraAtPoint
} from '../../../../Elephant/frontend/app/components/views/graphNavigationHelpers.js'

const nodes = [
  { id: 'A.md', title: 'A' },
  { id: 'B.md', title: 'B' },
  { id: 'C.md', title: 'C' },
  { id: 'D.md', title: 'D' },
  { id: 'E.md', title: 'E' }
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

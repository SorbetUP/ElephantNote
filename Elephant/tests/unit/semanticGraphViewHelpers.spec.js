import { describe, expect, it } from 'vitest'
import {
  buildSemanticNeighborhood,
  buildSemanticViewModel,
  buildSemanticGraphSurface,
  resolveSemanticGraph,
  selectSemanticGraphSource
} from '../../front/app/components/views/semanticGraphViewHelpers.js'

describe('semanticGraphViewHelpers', () => {
  const graph = {
    nodes: [
      { id: 'Projects', kind: 'folder', title: 'Projects' },
      { id: 'Projects/Plan.md', kind: 'note', title: 'Plan', tags: ['ai'], summary: 'Plan note' },
      { id: 'Projects/Graph.md', kind: 'note', title: 'Graph', tags: ['ai', 'semantic'] }
    ],
    edges: [
      { source: 'Projects', target: 'Projects/Plan.md', type: 'folder', reason: 'folder', weight: 0.3 },
      { source: 'Projects', target: 'Projects/Graph.md', type: 'folder', reason: 'folder', weight: 0.3 },
      { source: 'Projects/Plan.md', target: 'Projects/Graph.md', type: 'semantic', reason: 'embedding-similarity', weight: 0.91 }
    ],
    clusters: [
      { id: 'Projects', label: 'Projects', paths: ['Projects/Plan.md', 'Projects/Graph.md'] }
    ]
  }

  it('normalizes the semantic graph payload', () => {
    const normalized = resolveSemanticGraph(graph)

    expect(normalized.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/Plan.md', title: 'Plan', kind: 'note' }),
      expect.objectContaining({ id: 'Projects', kind: 'folder' })
    ]))
    expect(normalized.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'Projects/Plan.md', target: 'Projects/Graph.md', type: 'semantic' })
    ]))
  })

  it('builds a positioned semantic view model with cluster indices', () => {
    const model = buildSemanticViewModel({ graph, width: 1200, height: 900 })

    expect(model.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/Plan.md', clusterIndex: 0 }),
      expect.objectContaining({ id: 'Projects', clusterIndex: 0 })
    ]))
    expect(model.edges).toHaveLength(3)
    expect(model.clusters).toHaveLength(1)
  })

  it('builds a local neighborhood around a semantic node', () => {
    const neighborhood = buildSemanticNeighborhood({ graph, centerId: 'Projects/Plan.md', depth: 2 })

    expect(neighborhood.center).toMatchObject({ id: 'Projects/Plan.md' })
    expect(neighborhood.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'Projects/Plan.md',
      'Projects/Graph.md',
      'Projects'
    ]))
    expect(neighborhood.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'Projects/Plan.md', target: 'Projects/Graph.md' })
    ]))
  })

  it('builds a semantic-first graph surface by default', () => {
    const surface = buildSemanticGraphSurface({ graph })

    expect(surface.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/Plan.md' }),
      expect.objectContaining({ id: 'Projects/Graph.md' })
    ]))
    expect(surface.nodes.find((node) => node.id === 'Projects')).toBeUndefined()
    expect(surface.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'semantic' })
    ]))
    expect(surface.edges.find((edge) => edge.type === 'folder')).toBeUndefined()
  })

  it('can include folder structure in the semantic surface when requested', () => {
    const surface = buildSemanticGraphSurface({ graph, includeStructure: true })

    expect(surface.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects' })
    ]))
    expect(surface.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'folder' })
    ]))
  })

  it('prefers the backend inspection graph over the legacy fallback graph', () => {
    const surface = selectSemanticGraphSource({
      inspectionGraph: {
        nodes: [{ id: 'Projects/Plan.md', kind: 'note', title: 'Plan' }],
        edges: [],
        clusters: []
      },
      fallbackGraph: {
        nodes: [{ id: 'legacy-folder', kind: 'folder', title: 'Legacy folder' }],
        edges: [{ source: 'legacy-folder', target: 'legacy-note', type: 'folder' }],
        clusters: []
      }
    })

    expect(surface.nodes).toEqual([
      { id: 'Projects/Plan.md', kind: 'note', title: 'Plan' }
    ])
  })

  it('falls back to the legacy graph only when no inspection graph is available', () => {
    const surface = selectSemanticGraphSource({
      inspectionGraph: {
        nodes: [],
        edges: [],
        clusters: []
      },
      fallbackGraph: {
        nodes: [{ id: 'legacy-folder', kind: 'folder', title: 'Legacy folder' }],
        edges: [],
        clusters: []
      }
    })

    expect(surface.nodes).toEqual([
      { id: 'legacy-folder', kind: 'folder', title: 'Legacy folder' }
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildSemanticNeighborhood,
  buildSemanticViewModel,
  buildSemanticGraphSurface,
  buildGraphFromVaultEntries,
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

  it('returns an empty graph when no source is available', () => {
    const surface = selectSemanticGraphSource({
      inspectionGraph: null,
      fallbackGraph: null
    })

    expect(surface.nodes).toEqual([])
    expect(surface.edges).toEqual([])
  })
})

describe('buildGraphFromVaultEntries', () => {
  it('builds a graph from vault entries with notes and folders', () => {
    const entries = [
      { path: 'Projects/Plan.md', title: 'Plan', kind: 'note', tags: ['ai'] },
      { path: 'Projects/Graph.md', title: 'Graph', kind: 'note', tags: ['ai', 'semantic'] },
      { path: 'Notes/Readme.md', title: 'Readme', kind: 'note', tags: [] }
    ]

    const result = buildGraphFromVaultEntries(entries)

    expect(result.nodes.length).toBeGreaterThanOrEqual(3)
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/Plan.md', kind: 'note', title: 'Plan' }),
      expect.objectContaining({ id: 'Projects/Graph.md', kind: 'note', title: 'Graph' }),
      expect.objectContaining({ id: 'Notes/Readme.md', kind: 'note', title: 'Readme' })
    ]))
    expect(result.nodes.some((n) => n.kind === 'folder')).toBe(true)
    expect(result.edges.length).toBeGreaterThan(0)
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'folder' })
    ]))
    expect(result.clusters.length).toBeGreaterThan(0)
  })

  it('creates tag edges between notes sharing a tag', () => {
    const entries = [
      { path: 'A.md', title: 'A', kind: 'note', tags: ['ai', 'ml'] },
      { path: 'B.md', title: 'B', kind: 'note', tags: ['ai'] },
      { path: 'C.md', title: 'C', kind: 'note', tags: ['ml'] }
    ]

    const result = buildGraphFromVaultEntries(entries)
    const tagEdges = result.edges.filter((e) => e.type === 'tag')

    expect(tagEdges.length).toBeGreaterThan(0)
    expect(tagEdges.some((e) => e.reason === '#ai')).toBe(true)
    expect(tagEdges.some((e) => e.reason === '#ml')).toBe(true)
  })

  it('does not create tag edges for unique tags', () => {
    const entries = [
      { path: 'A.md', title: 'A', kind: 'note', tags: ['unique'] },
      { path: 'B.md', title: 'B', kind: 'note', tags: ['different'] }
    ]

    const result = buildGraphFromVaultEntries(entries)
    const tagEdges = result.edges.filter((e) => e.type === 'tag')

    expect(tagEdges).toHaveLength(0)
  })

  it('derives titles from filenames when missing', () => {
    const entries = [
      { path: 'Notes/My Note.md', kind: 'note' }
    ]

    const result = buildGraphFromVaultEntries(entries)

    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'My Note' })
    ]))
  })

  it('handles root-level notes without folders', () => {
    const entries = [
      { path: 'root-note.md', title: 'Root', kind: 'note', tags: [] }
    ]

    const result = buildGraphFromVaultEntries(entries)

    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'root-note.md', kind: 'note' })
    ]))
    expect(result.nodes.filter((n) => n.kind === 'folder')).toHaveLength(0)
  })

  it('returns empty arrays for empty input', () => {
    const result = buildGraphFromVaultEntries([])

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.clusters).toEqual([])
  })

  it('filters out non-note entries', () => {
    const entries = [
      { path: 'A.md', title: 'A', kind: 'note' },
      { path: 'folder/', title: 'folder', kind: 'folder' },
      { path: 'image.png', title: 'image', kind: 'file' }
    ]

    const result = buildGraphFromVaultEntries(entries)

    expect(result.nodes.every((n) => n.kind === 'note' || n.kind === 'folder')).toBe(true)
    expect(result.nodes.find((n) => n.id === 'image.png')).toBeUndefined()
  })

  it('preserves updatedAt for timelapse sorting', () => {
    const entries = [
      { path: 'A.md', title: 'A', kind: 'note', updatedAt: '2024-01-01T00:00:00Z' },
      { path: 'B.md', title: 'B', kind: 'note', updatedAt: '2024-06-01T00:00:00Z' }
    ]

    const result = buildGraphFromVaultEntries(entries)

    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'A.md', updatedAt: '2024-01-01T00:00:00Z' }),
      expect.objectContaining({ id: 'B.md', updatedAt: '2024-06-01T00:00:00Z' })
    ]))
  })
})

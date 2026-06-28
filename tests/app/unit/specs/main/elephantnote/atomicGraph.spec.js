import { describe, expect, it } from 'vitest'
import {
  createAtomicDocument,
  createAtomicSemanticIndex,
  createTextEmbedding,
  searchAtomicSemanticIndex
} from 'common/elephantnote/atomicAiEngine'
import { createSemanticGraph } from '../../../../../../Elephant/backend/js/search/graphLibrary.js'
import {
  buildGraphFromVaultEntries,
  buildSemanticGraphSurface,
  buildSemanticNeighborhood,
  buildSemanticViewModel,
  selectSemanticGraphSource
} from 'elephant-front/components/views/semanticGraphViewHelpers'
import {
  hasSparseGraph,
  hasSubstantialVault,
  shouldRepairSparseGraph
} from 'elephant-front/runtime/graphRuntimeFixes'

describe('Atomic embedding engine', () => {
  it('creates deterministic normalized embeddings that keep semantic aliases useful', () => {
    const vector = createTextEmbedding('AI embedding model for local notes')
    const same = createTextEmbedding('IA embeddings and LLM models for a vault')
    const unrelated = createTextEmbedding('calendar weather cooking recipe')

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

    expect(vector).toHaveLength(64)
    expect(magnitude).toBeGreaterThan(0.99)
    expect(magnitude).toBeLessThan(1.01)
    expect(searchAtomicSemanticIndex({
      index: createAtomicSemanticIndex([
        createAtomicDocument({ relativePath: 'ai.md', markdown: '# AI notes\nLocal embeddings and agents.' }),
        createAtomicDocument({ relativePath: 'food.md', markdown: '# Food\nCooking pasta and tomatoes.' })
      ]),
      query: 'model embeddings',
      limit: 1
    })[0].relativePath).toBe('ai.md')
    expect(vector.reduce((sum, value, index) => sum + value * same[index], 0))
      .toBeGreaterThan(vector.reduce((sum, value, index) => sum + value * unrelated[index], 0))
  })

  it('creates semantic links between related documents', () => {
    const index = createAtomicSemanticIndex([
      createAtomicDocument({ relativePath: 'ai/embeddings.md', markdown: '# Embeddings\nAI model embeddings for semantic search. #ai' }),
      createAtomicDocument({ relativePath: 'ai/rag.md', markdown: '# RAG\nLLM agents use embeddings for retrieval. #ai' }),
      createAtomicDocument({ relativePath: 'travel.md', markdown: '# Travel\nTrain tickets and hotel bookings.' })
    ])

    expect(index.documents).toHaveLength(3)
    expect(index.semanticLinks.some((link) =>
      link.source === 'ai/embeddings.md' && link.target === 'ai/rag.md'
    )).toBe(true)
  })
})

describe('Semantic graph library', () => {
  const documents = [
    createAtomicDocument({ relativePath: 'ai/embeddings.md', markdown: '# Embeddings\nAI embedding search. #ai' }),
    createAtomicDocument({ relativePath: 'ai/rag.md', markdown: '# RAG\nAI retrieval and graph links. #ai' }),
    createAtomicDocument({ relativePath: 'ops/sync.md', markdown: '# Sync\nRclone sync pipeline. #sync' })
  ]

  it('emits folder, tag, semantic edges and cluster metadata', () => {
    const graph = createSemanticGraph({
      documents,
      semanticLinks: [{ source: 'ai/embeddings.md', target: 'ai/rag.md', score: 0.91 }]
    })

    expect(graph.nodes.some((node) => node.kind === 'folder' && node.id === 'ai')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'note' && node.id === 'ai/rag.md')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'folder' && edge.source === 'ai')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'tag' && edge.reason === '#ai')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'semantic' && edge.weight === 0.91)).toBe(true)
    expect(graph.clusters.some((cluster) =>
      cluster.nodeCount === 2 &&
      Array.isArray(cluster.paths) &&
      cluster.paths.includes('ai/embeddings.md') &&
      cluster.paths.includes('ai/rag.md')
    )).toBe(true)
  })

  it('can disable structural edges without dropping semantic content', () => {
    const graph = createSemanticGraph({
      documents,
      semanticLinks: [{ source: 'ai/embeddings.md', target: 'ai/rag.md', score: 0.91 }],
      includeFolderEdges: false,
      includeTagEdges: false
    })

    expect(graph.edges.some((edge) => edge.type === 'folder')).toBe(false)
    expect(graph.edges.some((edge) => edge.type === 'tag')).toBe(false)
    expect(graph.edges.some((edge) => edge.type === 'semantic')).toBe(true)
  })
})

describe('Graph view helpers', () => {
  it('uses the inspection graph when available and falls back otherwise', () => {
    const inspectionGraph = { nodes: [{ id: 'a.md', title: 'A' }], edges: [], clusters: [] }
    const fallbackGraph = { nodes: [{ id: 'b.md', title: 'B' }], edges: [], clusters: [] }

    expect(selectSemanticGraphSource({ inspectionGraph, fallbackGraph })).toBe(inspectionGraph)
    expect(selectSemanticGraphSource({ inspectionGraph: null, fallbackGraph })).toBe(fallbackGraph)
  })

  it('builds a view model with positions, clusters and edge counts', () => {
    const model = buildSemanticViewModel({
      graph: {
        nodes: [
          { id: 'folder/a.md', relativePath: 'folder/a.md', title: 'A', tags: ['ai'] },
          { id: 'folder/b.md', relativePath: 'folder/b.md', title: 'B', tags: ['ai'] }
        ],
        edges: [{ source: 'folder/a.md', target: 'folder/b.md', weight: 0.8, type: 'semantic' }],
        clusters: []
      },
      savedPositions: { 'folder/b.md': { x: 12, y: 34 } },
      width: 800,
      height: 600
    })

    expect(model.nodes).toHaveLength(2)
    expect(model.nodes.find((node) => node.id === 'folder/b.md')).toMatchObject({ x: 12, y: 34 })
    expect(model.edgeCounts.get('folder/a.md')).toBe(1)
  })

  it('builds fallback graph data from vault entries', () => {
    const graph = buildGraphFromVaultEntries([
      { path: 'Notes/A.md', title: 'A' },
      { path: 'Notes/B.md', title: 'B' }
    ])

    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges).toHaveLength(2)
    expect(graph.nodes.some((node) => node.kind === 'folder' && node.id === 'Notes')).toBe(true)
  })

  it('creates neighborhood subgraphs around a focused note', () => {
    const graph = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ source: 'a', target: 'b' }]
    }

    const neighborhood = buildSemanticNeighborhood({ graph, centerId: 'a' })

    expect(neighborhood.nodes.map((node) => node.id).sort()).toEqual(['a', 'b'])
    expect(neighborhood.edges).toHaveLength(1)
  })

  it('filters structural nodes from graph surfaces when requested', () => {
    const surface = buildSemanticGraphSurface({
      graph: {
        nodes: [{ id: 'folder', kind: 'folder' }, { id: 'note.md', kind: 'note' }],
        edges: [{ source: 'folder', target: 'note.md', type: 'folder' }]
      },
      includeStructure: false
    })

    expect(surface.nodes).toHaveLength(1)
    expect(surface.nodes[0]).toMatchObject({ id: 'note.md', kind: 'note' })
    expect(surface.edges).toEqual([])
  })

  it('detects sparse graph state and substantial vaults', () => {
    expect(hasSparseGraph({ indexInspection: { graph: { nodes: [], edges: [] } } })).toBe(true)
    expect(hasSparseGraph({ indexInspection: { graph: { nodes: [{ id: 'a' }], edges: [] } } })).toBe(true)
    expect(hasSparseGraph({ indexInspection: { graph: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] } } })).toBe(false)
    expect(hasSubstantialVault({ rootEntries: [{ path: 'folder', kind: 'folder' }] })).toBe(true)
  })

  it('repairs only graph views with sparse graphs and non-empty vaults', () => {
    expect(shouldRepairSparseGraph({
      vaultStore: { activeWorkspaceView: 'graph', rootEntries: [{ path: 'folder', kind: 'folder' }] },
      searchStore: { indexInspection: { graph: { nodes: [], edges: [] } } },
      vaultPath: '/vault'
    })).toBe(true)
    expect(shouldRepairSparseGraph({
      vaultStore: { activeWorkspaceView: 'search', rootEntries: [{ path: 'folder', kind: 'folder' }] },
      searchStore: { indexInspection: { graph: { nodes: [], edges: [] } } },
      vaultPath: '/vault'
    })).toBe(false)
  })
})

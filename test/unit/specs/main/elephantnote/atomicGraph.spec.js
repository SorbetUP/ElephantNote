import { describe, expect, it } from 'vitest'
import {
  createAtomicDocument,
  createAtomicSemanticIndex,
  createTextEmbedding,
  searchAtomicSemanticIndex
} from 'common/elephantnote/atomicAiEngine'
import { createSemanticGraph } from 'elephant-back/search/graphLibrary'
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
    expect(graph.clusters.find((cluster) => cluster.id === 'ai')?.nodeCount).toBe(2)
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
    expect(model.clusters.length).toBeGreaterThan(0)
  })

  it('builds fallback graph data from vault entries', () => {
    const graph = buildGraphFromVaultEntries([
      { path: 'quick/a.md', title: 'A', kind: 'note', tags: ['quick'] },
      { path: 'quick/b.md', title: 'B', kind: 'note', tags: ['quick'] },
      { path: 'trash', title: 'trash', kind: 'folder' }
    ])

    expect(graph.nodes.some((node) => node.kind === 'folder' && node.id === 'quick')).toBe(true)
    expect(graph.nodes.filter((node) => node.kind === 'note')).toHaveLength(2)
    expect(graph.edges.some((edge) => edge.type === 'folder')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'tag')).toBe(true)
  })

  it('creates neighborhood subgraphs around a focused note', () => {
    const graph = {
      nodes: [
        { id: 'a.md', relativePath: 'a.md', title: 'A' },
        { id: 'b.md', relativePath: 'b.md', title: 'B' },
        { id: 'c.md', relativePath: 'c.md', title: 'C' }
      ],
      edges: [
        { source: 'a.md', target: 'b.md', type: 'semantic', reason: 'embedding', weight: 0.9 },
        { source: 'b.md', target: 'c.md', type: 'semantic', reason: 'embedding', weight: 0.7 }
      ],
      clusters: []
    }

    const neighborhood = buildSemanticNeighborhood({ graph, centerId: 'a.md', depth: 1, maxNodes: 2 })

    expect(neighborhood.center.id).toBe('a.md')
    expect(neighborhood.nodes.map((node) => node.id).sort()).toEqual(['a.md', 'b.md'])
    expect(neighborhood.edges).toHaveLength(1)
  })

  it('filters structural nodes from graph surfaces when requested', () => {
    const surface = buildSemanticGraphSurface({
      graph: {
        nodes: [
          { id: 'folder', kind: 'folder', relativePath: 'folder', title: 'Folder' },
          { id: 'folder/a.md', kind: 'note', relativePath: 'folder/a.md', title: 'A' }
        ],
        edges: [{ source: 'folder', target: 'folder/a.md', type: 'folder', weight: 0.3 }],
        clusters: [{ id: 'folder', label: 'Folder', paths: ['folder/a.md'] }]
      },
      includeStructure: false
    })

    expect(surface.nodes.map((node) => node.id)).toEqual(['folder/a.md'])
    expect(surface.edges).toEqual([])
  })
})

describe('Graph runtime repair guard', () => {
  it('detects sparse graph state and substantial vaults', () => {
    expect(hasSparseGraph({ indexInspection: { graph: { nodes: [{ id: 'one' }] } } })).toBe(true)
    expect(hasSparseGraph({ indexInspection: { graph: { nodes: [{ id: 'a' }, { id: 'b' }] } } })).toBe(false)
    expect(hasSubstantialVault({ rootEntries: Array.from({ length: 9 }, (_, index) => ({ path: `${index}.md`, kind: 'note' })) })).toBe(true)
    expect(hasSubstantialVault({ rootEntries: [{ path: 'folder', kind: 'folder' }] })).toBe(true)
  })

  it('repairs only graph views with sparse graphs and non-empty vaults', () => {
    const vaultStore = {
      activeWorkspaceView: 'graph',
      rootEntries: Array.from({ length: 12 }, (_, index) => ({ path: `${index}.md`, kind: 'note' }))
    }
    const searchStore = { indexInspection: { graph: { nodes: [] } } }

    expect(shouldRepairSparseGraph({ vaultStore, searchStore, vaultPath: '/vault' })).toBe(true)
    expect(shouldRepairSparseGraph({ vaultStore, searchStore, vaultPath: '/vault', lastRepairPath: '/vault' })).toBe(false)
    expect(shouldRepairSparseGraph({ vaultStore: { ...vaultStore, activeWorkspaceView: 'notes' }, searchStore, vaultPath: '/vault' })).toBe(false)
    expect(shouldRepairSparseGraph({ vaultStore, searchStore, vaultPath: '' })).toBe(false)
  })
})

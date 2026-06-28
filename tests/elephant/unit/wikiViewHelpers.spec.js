import { describe, expect, it } from 'vitest'
import {
  buildWikiGraphPanel,
  buildWikiRecordCard,
  buildWikiSourceCard
} from '../../front/app/components/views/wikiViewHelpers.js'

describe('wikiViewHelpers', () => {
  const graph = {
    nodes: [
      { id: 'Projects', kind: 'folder', title: 'Projects' },
      {
        id: 'Projects/Plan.md',
        kind: 'note',
        title: 'Plan',
        summary: 'A semantic plan',
        sourceCount: 2,
        tags: ['ai']
      },
      {
        id: 'Projects/Graph.md',
        kind: 'note',
        title: 'Graph',
        summary: 'Graph view details',
        sourceCount: 1,
        tags: ['graph']
      }
    ],
    edges: [
      { source: 'Projects', target: 'Projects/Plan.md', type: 'folder', weight: 0.3 },
      { source: 'Projects/Plan.md', target: 'Projects/Graph.md', type: 'semantic', weight: 0.9 }
    ],
    clusters: [
      { id: 'Projects', label: 'Projects', paths: ['Projects/Plan.md', 'Projects/Graph.md'] }
    ]
  }

  it('builds a semantic-first wiki graph panel', () => {
    const panel = buildWikiGraphPanel({
      inspectionGraph: graph,
      fallbackGraph: {
      nodes: [{ id: 'compatibility-folder', kind: 'folder', title: 'Compatibility' }],
        edges: [],
        clusters: []
      }
    })

    expect(panel.summary).toMatchObject({
      nodes: 2,
      semanticEdges: 1,
      structureEdges: 0,
      clusters: 1,
      sources: 3
    })
    expect(panel.surface.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/Plan.md' }),
      expect.objectContaining({ id: 'Projects/Graph.md' })
    ]))
    expect(panel.surface.nodes.find((node) => node.id === 'Projects')).toBeUndefined()
  })

  it('builds a wiki record card with citation counts', () => {
    const card = buildWikiRecordCard({
      id: 'wiki-projects',
      topic: 'Projects',
      summary: 'Graph-backed summary',
      citations: [
        { path: 'Projects/Plan.md', title: 'Plan', excerpt: 'Plan excerpt' },
        { path: 'Projects/Graph.md', title: 'Graph', excerpt: 'Graph excerpt' }
      ],
      status: 'proposed'
    })

    expect(card).toMatchObject({
      id: 'wiki-projects',
      title: 'Projects',
      citationCount: 2,
      status: 'proposed'
    })
  })

  it('builds a source card from source insight and selected citation', () => {
    const card = buildWikiSourceCard({
      selectedRecord: {
        id: 'wiki-projects',
        topic: 'Projects',
        summary: 'Graph-backed summary',
        citations: [{ path: 'Projects/Plan.md', title: 'Plan', excerpt: 'Plan excerpt' }]
      },
      selectedCitation: {
        path: 'Projects/Plan.md',
        title: 'Plan',
        excerpt: 'Plan excerpt'
      },
      sourceInsight: {
        source: {
          path: 'Projects/Plan.md',
          title: 'Plan',
          summary: 'A semantic plan',
          kind: 'note',
          sourceCount: 2,
          chunkCount: 4,
          tags: ['ai']
        },
        relatedNodes: [
          {
            id: 'Projects/Graph.md',
            title: 'Graph',
            summary: 'Graph view details',
            kind: 'note',
            linkType: 'semantic',
            weight: 0.9
          }
        ],
        cluster: {
          id: 'Projects',
          label: 'Projects',
          nodeCount: 2,
          paths: ['Projects/Plan.md', 'Projects/Graph.md']
        }
      }
    })

    expect(card.source).toMatchObject({
      path: 'Projects/Plan.md',
      title: 'Plan',
      sourceCount: 2,
      chunkCount: 4
    })
    expect(card.relatedNodes).toEqual([
      expect.objectContaining({
        id: 'Projects/Graph.md',
        linkType: 'semantic'
      })
    ])
    expect(card.cluster).toMatchObject({
      label: 'Projects',
      nodeCount: 2
    })
  })
})

import { describe, expect, it } from 'vitest'
import { buildNoteGraphPreview } from '../../front/app/components/editor/noteGraphHelpers.js'

describe('noteGraphHelpers', () => {
  const graph = {
    nodes: [
      {
        id: 'Projects/Plan.md',
        title: 'Plan',
        kind: 'note',
        summary: 'Plan summary',
        sourceCount: 2,
        chunkCount: 4,
        tags: ['ai'],
        sources: [
          { path: 'Sources/Guide.md', title: 'Guide', excerpt: 'Guide excerpt', type: 'note' }
        ]
      },
      {
        id: 'Projects/Graph.md',
        title: 'Graph',
        kind: 'note',
        summary: 'Graph summary',
        sourceCount: 1,
        chunkCount: 3,
        tags: ['graph']
      },
      {
        id: 'Projects',
        title: 'Projects',
        kind: 'folder'
      }
    ],
    edges: [
      { source: 'Projects', target: 'Projects/Plan.md', type: 'folder', weight: 0.3 },
      { source: 'Projects/Plan.md', target: 'Projects/Graph.md', type: 'semantic', weight: 0.9 }
    ],
    clusters: [
      { id: 'Projects', label: 'Projects', nodeCount: 2, paths: ['Projects/Plan.md', 'Projects/Graph.md'] }
    ]
  }

  it('builds a semantic note preview with cluster and source details', () => {
    const preview = buildNoteGraphPreview({
      graph,
      notePath: 'Projects/Plan.md',
      limit: 4
    })

    expect(preview).toMatchObject({
      node: expect.objectContaining({
        id: 'Projects/Plan.md',
        sourceCount: 2,
        chunkCount: 4
      }),
      cluster: expect.objectContaining({
        label: 'Projects',
        nodeCount: 2
      })
    })
    expect(preview.stats).toMatchObject({
      totalNodes: 3,
      semanticLinks: 1,
      incidentLinks: 1,
      clusters: 1
    })
    expect(preview.sources).toEqual([
      expect.objectContaining({
        path: 'Sources/Guide.md',
        title: 'Guide',
        excerpt: 'Guide excerpt'
      })
    ])
    expect(preview.relatedNodes).toEqual([
      expect.objectContaining({
        id: 'Projects/Graph.md',
        types: ['semantic']
      })
    ])
    expect(preview.linkTypeCounts).toEqual([
      { type: 'semantic', count: 1 }
    ])
  })
})

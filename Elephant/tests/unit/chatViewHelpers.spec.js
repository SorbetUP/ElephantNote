import { describe, expect, it } from 'vitest'
import { buildChatContextPanel } from '../../front/app/components/views/chatViewHelpers.js'

describe('chatViewHelpers', () => {
  it('builds a semantic graph driven chat context panel', () => {
    const panel = buildChatContextPanel({
      graph: {
        nodes: [
          { id: 'A.md', kind: 'note', title: 'Alpha', sourceCount: 2 },
          { id: 'B.md', kind: 'note', title: 'Beta', sourceCount: 1 }
        ],
        edges: [
          { source: 'A.md', target: 'B.md', type: 'semantic', reason: 'embedding-similarity', weight: 0.9 }
        ],
        clusters: [
          { id: 'cluster-a', label: 'Cluster A', paths: ['A.md', 'B.md'], nodeCount: 2 }
        ]
      }
    })

    expect(panel.summary).toMatchObject({
      nodes: 2,
      semanticEdges: 1,
      structureEdges: 0,
      clusters: 1,
      sources: 3
    })
    expect(panel.clusters).toEqual([
      expect.objectContaining({
        label: 'Cluster A',
        nodeCount: 2
      })
    ])
    expect(panel.quickPrompts).toHaveLength(4)
  })
})

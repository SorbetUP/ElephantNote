import { describe, expect, it } from 'vitest'

import { buildSemanticGraphSurface } from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'

describe('Wiki graph surface', () => {
  it('preserves backend Wiki node identities and keeps their edges visible', () => {
    const surface = buildSemanticGraphSurface({
      graph: {
        nodes: [
          {
            id: 'wiki:one',
            path: '.elephantnote/wiki/wiki-one.md',
            relativePath: '.elephantnote/wiki/wiki-one.md',
            kind: 'wiki',
            title: 'Wiki one'
          },
          {
            id: 'wiki:two',
            path: '.elephantnote/wiki/wiki-two.md',
            relativePath: '.elephantnote/wiki/wiki-two.md',
            kind: 'wiki',
            title: 'Wiki two'
          },
          { id: 'Notes/A.md', path: 'Notes/A.md', relativePath: 'Notes/A.md', kind: 'note', title: 'A' }
        ],
        edges: [
          { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },
          { source: 'wiki:one', target: 'wiki:two', edge_type: 'wiki-link' }
        ],
        clusters: [
          { id: 'wiki:one', label: 'Wiki one', paths: ['wiki:one', 'Notes/A.md'] }
        ]
      }
    })

    expect(surface.nodes.map((node) => node.id)).toEqual(['wiki:one', 'wiki:two', 'Notes/A.md'])
    expect(surface.nodeMap.get('wiki:one')?.relativePath).toBe('.elephantnote/wiki/wiki-one.md')
    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-link'])
    expect(surface.edgeCounts.get('wiki:one')).toBe(2)
    expect(surface.edgeCounts.get('Notes/A.md')).toBe(1)
    expect(surface.clusters[0]?.paths).toContain('wiki:one')
  })
})

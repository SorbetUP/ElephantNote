import { describe, expect, it } from 'vitest'

import { buildSemanticGraphSurface } from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'

describe('Wiki graph surface', () => {
  it('keeps Wiki source and Wiki bridge edges visible', () => {
    const surface = buildSemanticGraphSurface({
      graph: {
        nodes: [
          { id: 'wiki:one', kind: 'wiki', title: 'Wiki one' },
          { id: 'wiki:two', kind: 'wiki', title: 'Wiki two' },
          { id: 'Notes/A.md', kind: 'note', title: 'A' }
        ],
        edges: [
          { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },
          { source: 'wiki:one', target: 'wiki:two', edge_type: 'wiki-link' }
        ],
        clusters: []
      }
    })

    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-link'])
    expect(surface.edgeCounts.get('wiki:one')).toBe(2)
    expect(surface.edgeCounts.get('Notes/A.md')).toBe(1)
  })
})

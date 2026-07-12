import { describe, expect, it } from 'vitest'

import {
  buildSemanticGraphSurface,
  buildSemanticViewModel
} from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'

describe('Wiki graph surface', () => {
  const graph = {
    nodes: [
      {
        id: 'wiki:one',
        path: '.elephantnote/wiki/wiki-one.md',
        relativePath: '.elephantnote/wiki/wiki-one.md',
        kind: 'wiki',
        title: 'Wiki one'
      },
      { id: 'Notes/A.md', path: 'Notes/A.md', relativePath: 'Notes/A.md', kind: 'note', title: 'A' },
      { id: 'Notes/B.md', path: 'Notes/B.md', relativePath: 'Notes/B.md', kind: 'note', title: 'B' },
      { id: 'Other/C.md', path: 'Other/C.md', relativePath: 'Other/C.md', kind: 'note', title: 'C' }
    ],
    edges: [
      { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },
      { source: 'wiki:one', target: 'Notes/B.md', edge_type: 'wiki-source' }
    ],
    clusters: [
      { id: 'wiki:one', label: 'Wiki one', paths: ['wiki:one', 'Notes/A.md', 'Notes/B.md'] }
    ]
  }

  it('preserves backend Wiki node identities and keeps their edges visible', () => {
    const surface = buildSemanticGraphSurface({ graph })
    expect(surface.nodes.map((node) => node.id)).toEqual(['wiki:one', 'Notes/A.md', 'Notes/B.md', 'Other/C.md'])
    expect(surface.nodeMap.get('wiki:one')?.relativePath).toBe('.elephantnote/wiki/wiki-one.md')
    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-source'])
    expect(surface.edgeCounts.get('wiki:one')).toBe(2)
    expect(surface.clusters[0]?.paths).toContain('wiki:one')
  })

  it('places Wiki sources close to their Wiki and ignores stale saved positions for linked nodes', () => {
    const model = buildSemanticViewModel({
      graph,
      width: 1200,
      height: 800,
      savedPositions: {
        'wiki:one': { x: 20, y: 20 },
        'Notes/A.md': { x: 1800, y: 1200 },
        'Notes/B.md': { x: -900, y: -600 },
        'Other/C.md': { x: 33, y: 44 }
      }
    })
    const byId = new Map(model.nodes.map((node) => [node.id, node]))
    const wiki = byId.get('wiki:one')
    const sourceA = byId.get('Notes/A.md')
    const sourceB = byId.get('Notes/B.md')
    const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y)

    expect(wiki.x).toBeCloseTo(600)
    expect(wiki.y).toBeCloseTo(400)
    expect(distance(wiki, sourceA)).toBeLessThan(120)
    expect(distance(wiki, sourceB)).toBeLessThan(120)
    expect(sourceA.x).not.toBe(1800)
    expect(byId.get('Other/C.md')).toMatchObject({ x: 33, y: 44 })
  })
})

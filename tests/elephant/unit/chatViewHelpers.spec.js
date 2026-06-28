import { describe, expect, it } from 'vitest'
import {
  buildChatContextPanel,
  formatChatTimestamp,
  shapeToolCallsForAssistant
} from '../../front/app/components/views/chatViewHelpers.js'

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
    panel.quickPrompts.forEach((prompt) => {
      expect(prompt.icon).toBeTruthy()
    })
  })

  it('shapes tool calls from a rag chat result', () => {
    const calls = shapeToolCallsForAssistant({
      citations: [{ path: 'a.md', title: 'A' }],
      wikiContext: { source: { path: 'a.md' }, graphSummary: { nodes: 1, semanticLinks: 0, clusters: 0 } }
    })
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe('rag.search')
    expect(calls[1].name).toBe('wiki.context')
  })

  it('returns empty tool calls when nothing was retrieved', () => {
    expect(shapeToolCallsForAssistant({})).toEqual([])
  })

  it('formats chat timestamps', () => {
    expect(formatChatTimestamp(Date.now())).toMatch(/\d/)
    expect(formatChatTimestamp(new Date(2020, 0, 15, 10, 30).getTime())).toMatch(/\d/)
    expect(formatChatTimestamp(null)).toBe('')
    expect(formatChatTimestamp('')).toBe('')
  })
})

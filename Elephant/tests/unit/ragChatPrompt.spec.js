import { describe, expect, it } from 'vitest'
import { buildRagChatPrompt } from '../../back/app/chat/ragPrompt.js'

describe('rag chat prompt builder', () => {
  it('includes semantic graph context alongside cited notes', () => {
    const { systemMessage, prompt } = buildRagChatPrompt({
      message: 'What is the plan?',
      citations: [
        {
          title: 'Plan',
          path: 'Project/Plan.md',
          snippet: 'The plan is to ship the semantic graph.'
        }
      ],
      wikiContext: {
        source: {
          title: 'Plan',
          path: 'Project/Plan.md'
        },
        graphSummary: {
          nodes: 12,
          semanticLinks: 4,
          clusters: 2
        },
        cluster: {
          label: 'ai',
          nodeCount: 3
        },
        relatedNodes: [
          {
            title: 'Graph',
            linkType: 'semantic'
          }
        ]
      }
    })

    expect(systemMessage).toContain('semantic graph')
    expect(systemMessage).toContain('wiki context')
    expect(prompt).toContain('Question: What is the plan?')
    expect(prompt).toContain('[1] Plan (Project/Plan.md)')
    expect(prompt).toContain('Wiki context:')
    expect(prompt).toContain('12 nodes')
    expect(prompt).toContain('Graph [semantic]')
  })

  it('includes recent conversation history when messages are provided', () => {
    const { prompt, systemMessage } = buildRagChatPrompt({
      message: 'What about the follow-up?',
      messages: [
        { role: 'user', content: 'What is the plan?' },
        { role: 'assistant', content: 'The plan is to ship the semantic graph.' },
        { role: 'user', content: 'What about the follow-up?' }
      ]
    })

    expect(systemMessage).toContain('conversation history')
    expect(prompt).toContain('Conversation history:')
    expect(prompt).toContain('User: What is the plan?')
    expect(prompt).toContain('Assistant: The plan is to ship the semantic graph.')
  })
})

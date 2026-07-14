import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'
import { createDomainClients } from '../../../../Elephant/frontend/app/services/elephantnoteClient/domainClients.js'

const createCall = ({ chatResults = [] } = {}) => {
  let chatIndex = 0
  const call = vi.fn(async (action) => {
    if (action === API.SEARCH_REBUILD) return { ok: true }
    if (action === API.RAG_CHAT) {
      const next = chatResults[chatIndex] || { answer: 'empty', citations: [] }
      chatIndex += 1
      return next
    }
    return { ok: true }
  })
  return { call }
}

const countAction = (call, action) => call.mock.calls.filter(([name]) => name === action).length
const createClients = (call) => createDomainClients(call, () => ({ describeApi: vi.fn(), callApi: vi.fn() }))

describe('domain clients chat search behavior', () => {
  it('delegates indexing and retrieval to the Rust RAG command', async () => {
    const { call } = createCall({
      chatResults: [
        { answer: 'first answer', citations: [{ path: 'A.md' }] },
        { answer: 'second answer', citations: [{ path: 'B.md' }] }
      ]
    })
    const clients = createClients(call)

    await clients.rag.chat('first')
    await clients.rag.chat('second')

    expect(countAction(call, API.RAG_CHAT)).toBe(2)
    expect(countAction(call, API.SEARCH_INIT_VAULT)).toBe(0)
  })

  it('does not rebuild chat search when the model already produced an answer', async () => {
    const { call } = createCall({ chatResults: [{ answer: 'first answer', citations: [] }, { answer: 'second answer', citations: [] }] })
    const clients = createClients(call)
    await clients.rag.chat('first')
    await clients.rag.chat('second')
    expect(countAction(call, API.SEARCH_REBUILD)).toBe(0)
  })

  it('rebuilds once and retries when Rust RAG returns an empty answer', async () => {
    const { call } = createCall({
      chatResults: [
        { answer: '', citations: [] },
        { answer: 'answer after rebuild', citations: [{ path: 'Recovered.md' }] }
      ]
    })
    const clients = createClients(call)

    const result = await clients.rag.chat('recover the index')

    expect(result.answer).toBe('answer after rebuild')
    expect(countAction(call, API.SEARCH_REBUILD)).toBe(1)
    expect(countAction(call, API.RAG_CHAT)).toBe(2)
  })

  it('forwards conversation history to rag chat requests', async () => {
    const { call } = createCall({ chatResults: [{ answer: 'context aware answer', citations: [] }] })
    const clients = createClients(call)
    await clients.rag.chat({
      message: 'What about the follow-up?',
      limit: 6,
      messages: [
        { role: 'user', content: 'What is the plan?' },
        { role: 'assistant', content: 'Ship the semantic graph.' },
        { role: 'user', content: 'What about the follow-up?' }
      ]
    })
    expect(call).toHaveBeenCalledWith(API.RAG_CHAT, expect.objectContaining({
      message: 'What about the follow-up?', limit: 6, messages: expect.any(Array)
    }))
  })
})

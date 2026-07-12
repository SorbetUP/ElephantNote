import { describe, expect, it } from 'vitest'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

const makeClient = (handler) => {
  const calls = []
  const call = async (action, payload = {}) => {
    calls.push({ action, payload })
    return handler(action)
  }
  return { calls, clients: createDomainClients(call, () => ({})) }
}

describe('RAG chat client', () => {
  it('calls RAG directly without implicitly initializing or rebuilding search', async () => {
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) return { answer: 'ok', citations: [{ path: 'A.md' }] }
      return {}
    })

    await clients.rag.chat('question', 4)

    expect(calls).toEqual([
      { action: API.RAG_CHAT, payload: { message: 'question', limit: 4, messages: [] } }
    ])
  })

  it('returns the first answer without an automatic retry or index mutation', async () => {
    let ragCalls = 0
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) {
        ragCalls += 1
        return { answer: 'no citations', citations: [] }
      }
      return {}
    })

    const result = await clients.rag.chat('semantic question', 8)

    expect(result.answer).toBe('no citations')
    expect(ragCalls).toBe(1)
    expect(calls).toEqual([
      { action: API.RAG_CHAT, payload: { message: 'semantic question', limit: 8, messages: [] } }
    ])
  })
})

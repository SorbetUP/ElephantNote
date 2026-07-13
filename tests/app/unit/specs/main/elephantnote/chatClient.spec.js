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
  it('delegates vault lookup and retrieval to the Rust RAG command', async () => {
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) return { answer: 'ok', citations: [{ path: 'A.md' }] }
      return {}
    })

    await clients.rag.chat('question', 4)

    expect(calls).toEqual([
      { action: API.RAG_CHAT, payload: { message: 'question', limit: 4, messages: [] } }
    ])
  })

  it('returns the first answer without a frontend rebuild retry', async () => {
    let ragCalls = 0
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) {
        ragCalls += 1
        return ragCalls === 1
          ? { answer: 'no citations', citations: [] }
          : { answer: 'ok', citations: [{ path: 'B.md' }] }
      }
      return {}
    })

    const result = await clients.rag.chat('semantic question', 8)

    expect(result.answer).toBe('no citations')
    expect(calls.map((entry) => entry.action)).toEqual([API.RAG_CHAT])
  })
})

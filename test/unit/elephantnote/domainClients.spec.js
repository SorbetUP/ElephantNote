import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'
import { createDomainClients } from '../../../Elephant/front/app/services/elephantnoteClient/domainClients.js'

let vaultCounter = 0

const createCall = ({ chatResults = [] } = {}) => {
  const vaultPath = `/tmp/elephantnote-test-vault-${++vaultCounter}`
  let chatIndex = 0
  const call = vi.fn(async (action) => {
    if (action === API.VAULTS_GET) {
      return { activeVault: { path: vaultPath } }
    }
    if (action === API.SEARCH_INIT_VAULT) {
      return { ok: true }
    }
    if (action === API.SEARCH_REBUILD) {
      return { ok: true }
    }
    if (action === API.RAG_CHAT) {
      const next = chatResults[chatIndex] || { answer: 'empty', citations: [] }
      chatIndex += 1
      return next
    }
    return { ok: true }
  })
  return { call, vaultPath }
}

const countAction = (call, action) => call.mock.calls.filter(([name]) => name === action).length

const createClients = (call) => createDomainClients(call, () => ({
  describeApi: vi.fn(),
  callApi: vi.fn()
}))

describe('domain clients chat search behavior', () => {
  it('initializes chat search once for the same vault', async () => {
    const { call } = createCall({
      chatResults: [
        { answer: 'first answer', citations: [{ path: 'A.md' }] },
        { answer: 'second answer', citations: [{ path: 'B.md' }] }
      ]
    })
    const clients = createClients(call)

    await clients.rag.chat('first')
    await clients.rag.chat('second')

    expect(countAction(call, API.SEARCH_INIT_VAULT)).toBe(1)
  })

  it('does not repeatedly rebuild chat search when citations are still empty', async () => {
    const { call } = createCall({
      chatResults: [
        { answer: 'empty first', citations: [] },
        { answer: 'empty retry', citations: [] },
        { answer: 'empty second', citations: [] }
      ]
    })
    const clients = createClients(call)

    await clients.rag.chat('first')
    await clients.rag.chat('second')

    expect(countAction(call, API.SEARCH_REBUILD)).toBe(1)
  })
})

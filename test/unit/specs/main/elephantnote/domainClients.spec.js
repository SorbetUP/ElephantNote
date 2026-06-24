import { describe, expect, it } from 'vitest'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

const makeClient = () => {
  const calls = []
  const call = async (action, payload = {}) => {
    calls.push({ action, payload })
    return { action, payload }
  }
  return { calls, clients: createDomainClients(call, () => ({})) }
}

describe('domain clients', () => {
  it('routes sync plan requests through the public API action', async () => {
    const { calls, clients } = makeClient()
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }

    await clients.sync.plan(payload)

    expect(API.SYNC_PLAN).toBe('sync.plan')
    expect(calls).toEqual([{ action: API.SYNC_PLAN, payload }])
  })
})

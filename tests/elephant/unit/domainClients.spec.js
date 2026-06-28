import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'
import { createDomainClients } from '@/elephantnote/services/elephantnoteClient/domainClients'

describe('domain client serialization', () => {
  it('sends plain AI config payloads over IPC', async () => {
    const call = vi.fn(async (_action, payload) => payload)
    const clients = createDomainClients(call, () => ({}))
    const payload = new Proxy(
      {
        preset: 'nodeLlamaCpp',
        transport: 'node-llama-cpp',
        endpoint: 'node-llama-cpp://local',
        model: 'hf:test/model',
        apiKey: 'secret',
        codexLinkEnabled: true,
        nested: { value: 1 }
      },
      {}
    )

    await expect(clients.ai.setConfig(payload)).resolves.toMatchObject({
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp',
      endpoint: 'node-llama-cpp://local',
      model: 'hf:test/model'
    })
    expect(call).toHaveBeenCalledWith(API.AI_CONFIG_SET, {
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp',
      endpoint: 'node-llama-cpp://local',
      model: 'hf:test/model',
      apiKey: 'secret',
      codexLinkEnabled: true,
      nested: { value: 1 }
    })

    await expect(clients.ai.testConfig(payload)).resolves.toMatchObject({
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp'
    })
    expect(call).toHaveBeenCalledWith(API.AI_CONFIG_TEST, {
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp',
      endpoint: 'node-llama-cpp://local',
      model: 'hf:test/model',
      apiKey: 'secret',
      codexLinkEnabled: true,
      nested: { value: 1 }
    })
  })

  it('serializes wiki context requests for the backend', async () => {
    const call = vi.fn(async (_action, payload) => payload)
    const clients = createDomainClients(call, () => ({}))

    await expect(clients.wiki.context('Project/Plan.md', 3)).resolves.toMatchObject({
      path: 'Project/Plan.md',
      limit: 3
    })
    expect(call).toHaveBeenCalledWith(API.WIKI_CONTEXT, {
      path: 'Project/Plan.md',
      limit: 3
    })
  })
})

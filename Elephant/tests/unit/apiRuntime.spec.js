import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiCaller,
  describeElephantNoteApi,
  subscribeApiEvent
} from '@/elephantnote/services/elephantnoteClient/apiRuntime'
import { ELEPHANTNOTE_API_ACTIONS as API, ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS } from 'common/elephantnote/apiContractsV2'

describe('versioned API runtime', () => {
  beforeEach(() => {
    window.elephantnote = undefined
  })

  it('serializes payloads before sending them to the bridge', async() => {
    const call = vi.fn(async() => ({ ok: true, data: { done: true } }))
    const caller = createApiCaller()
    window.elephantnote = { api: { call } }
    const payload = new Proxy({ relativePath: 'Note.md', markdown: '# Note' }, {})
    await expect(caller(API.NOTES_WRITE, payload)).resolves.toEqual({ done: true })
    expect(call).toHaveBeenCalledWith(API.NOTES_WRITE, { relativePath: 'Note.md', markdown: '# Note' })
  })

  it('uses a compatibility adapter only when the backend lacks the action', async() => {
    const compatibility = {
      canHandle: vi.fn((action) => action === API.MODELS_SEARCH),
      call: vi.fn(async() => ({ results: ['model'] })),
      subscribe: vi.fn()
    }
    window.elephantnote = { api: { call: vi.fn(async() => ({ ok: false, error: { code: 'ELEPHANTNOTE_UNKNOWN_API_ACTION', message: 'Unknown ElephantNote API action' } })) } }
    const caller = createApiCaller(compatibility)
    await expect(caller(API.MODELS_SEARCH, { provider: 'huggingface', query: 'tiny' })).resolves.toEqual({ results: ['model'] })
    expect(compatibility.call).toHaveBeenCalledOnce()
  })

  it('does not hide real backend errors behind compatibility fallbacks', async() => {
    const compatibility = { canHandle: vi.fn(() => true), call: vi.fn(), subscribe: vi.fn() }
    window.elephantnote = { api: { call: vi.fn(async() => ({ ok: false, error: { code: 'VAULT_LOCKED', message: 'Vault is locked' } })) } }
    const caller = createApiCaller(compatibility)
    await expect(caller(API.MODELS_LIST, {})).rejects.toMatchObject({ code: 'VAULT_LOCKED' })
    expect(compatibility.call).not.toHaveBeenCalled()
  })

  it('works without a backend when an isolated compatibility adapter owns the action', async() => {
    const compatibility = {
      canHandle: (action) => action === 'test.compatibility',
      call: vi.fn(async(_action, payload) => payload),
      subscribe: vi.fn()
    }
    await expect(createApiCaller(compatibility)('test.compatibility', { value: 1 })).resolves.toEqual({ value: 1 })
  })

  it('merges backend capabilities with the canonical contract', async() => {
    window.elephantnote = { api: { call: vi.fn(), describe: vi.fn(async() => ({ version: 'backend', actions: ['custom.action'] })) } }
    const description = await describeElephantNoteApi()
    expect(description.actions).toContain('custom.action')
    expect(description.actions).toContain(API.MODELS_SEARCH)
    expect(description.actions).toContain(API.ATOMIC_GRAPH)
    expect(description.contractRevision).toBe(2)
  })

  it('prefers backend event subscriptions and falls back to the adapter', () => {
    const backendUnsubscribe = vi.fn()
    const backendSubscribe = vi.fn(() => backendUnsubscribe)
    window.elephantnote = { api: { call: vi.fn(), subscribe: backendSubscribe } }
    const listener = vi.fn()
    expect(subscribeApiEvent(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)).toBe(backendUnsubscribe)
    expect(backendSubscribe).toHaveBeenCalledWith(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)
  })
})

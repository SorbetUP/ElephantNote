import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API, ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS } from 'common/elephantnote/apiActions'
import { createDomainClients } from '@/elephantnote/services/elephantnoteClient/domainClients'

describe('domain clients use the canonical API only', () => {
  it('routes provider-neutral calendar methods and legacy aliases through call()', async() => {
    const call = vi.fn(async() => ({}))
    const clients = createDomainClients(call)

    await clients.calendar.import('google', { sourcePath: '/tmp/calendar.ics' })
    expect(call).toHaveBeenCalledWith(API.CALENDAR_IMPORT, {
      provider: 'google',
      sourcePath: '/tmp/calendar.ics'
    })

    await clients.calendar.syncGoogle()
    expect(call).toHaveBeenCalledWith(API.CALENDAR_SYNC, {
      provider: 'google',
      options: {}
    })
  })

  it('routes model library operations through canonical action names', async() => {
    const call = vi.fn(async() => ({}))
    const clients = createDomainClients(call)

    await clients.models.searchHuggingFace({ query: 'embedding' })
    expect(call).toHaveBeenCalledWith(API.MODELS_SEARCH, {
      provider: 'huggingface',
      query: 'embedding'
    })

    await clients.models.download({ repoId: 'org/model' })
    expect(call).toHaveBeenCalledWith(API.MODELS_ACQUIRE, { repoId: 'org/model' })
  })

  it('routes search concepts and Atomic features through call()', async() => {
    const call = vi.fn(async() => ({}))
    const clients = createDomainClients(call)

    await clients.search.concepts({ query: 'graph' })
    expect(call).toHaveBeenCalledWith(API.SEARCH_CONCEPTS, { query: 'graph' })

    await clients.atomicFeatures.summarize('/vault', 'Note.md', { provider: 'local' })
    expect(call).toHaveBeenCalledWith(API.ATOMIC_SUMMARIZE, {
      vaultRoot: '/vault',
      relativePath: 'Note.md',
      providerConfig: { provider: 'local' }
    })
  })

  it('uses the API event subscription abstraction for progress', () => {
    const subscribe = vi.fn(() => vi.fn())
    const clients = createDomainClients(vi.fn(), subscribe)
    const listener = vi.fn()

    clients.models.onDownloadProgress(listener)
    expect(subscribe).toHaveBeenCalledWith(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)

    clients.atomicFeatures.onModelPullProgress(listener)
    expect(subscribe).toHaveBeenCalledWith(EVENTS.ATOMIC_MODEL_PULL_PROGRESS, listener)
  })
})

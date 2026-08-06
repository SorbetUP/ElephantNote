import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API, ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS } from 'common/elephantnote/apiActions'
import { createPlatformCompatibilityAdapter } from '@/elephantnote/services/elephantnoteClient/platformCompatibilityAdapter'

const createTarget = () => {
  const unlisten = vi.fn()
  const bridge = {
    calendar: {
      importGoogle: vi.fn(async() => ({ imported: true })),
      importGoogleFromPath: vi.fn(async(payload) => payload),
      googleConfigGet: vi.fn(async() => ({ calendarId: 'primary' })),
      googleConfigSet: vi.fn(async(config) => config),
      googleSync: vi.fn(async() => ({ synced: true }))
    },
    models: {
      list: vi.fn(async() => ['model-a']),
      searchHuggingFace: vi.fn(async(payload) => payload),
      info: vi.fn(async(payload) => payload),
      download: vi.fn(async(payload) => payload),
      activate: vi.fn(async(payload) => payload),
      deactivate: vi.fn(async(payload) => payload),
      remove: vi.fn(async(payload) => payload),
      active: vi.fn(async() => ({ id: 'model-a' })),
      cancelDownload: vi.fn(async(payload) => payload),
      downloadStatus: vi.fn(async(payload) => payload),
      refreshIndex: vi.fn(async() => true),
      onDownloadProgress: vi.fn(() => unlisten)
    },
    search: {
      concepts: vi.fn(async(payload) => payload)
    },
    atomicFeatures: {
      describeApi: vi.fn(async() => ({ actions: [] })),
      callApi: vi.fn(async(payload) => payload),
      providers: vi.fn(async() => ['local']),
      overview: vi.fn(async(payload) => payload),
      graph: vi.fn(async(payload) => payload),
      wiki: vi.fn(async(payload) => payload),
      createWikiPage: vi.fn(async(payload) => payload),
      summarize: vi.fn(async(payload) => payload),
      structure: vi.fn(async(payload) => payload),
      autoNameNote: vi.fn(async(payload) => payload),
      listLocalModels: vi.fn(async(payload) => payload),
      pullModel: vi.fn(async(payload) => payload),
      onModelPullProgress: vi.fn(() => unlisten)
    }
  }
  return { target: { elephantnote: bridge }, bridge, unlisten }
}

describe('platform compatibility adapter', () => {
  it('routes generic calendar operations to the selected provider adapter', async() => {
    const { target, bridge } = createTarget()
    const adapter = createPlatformCompatibilityAdapter(target)

    await expect(adapter.call(API.CALENDAR_IMPORT, {
      provider: 'google',
      sourcePath: '/tmp/calendar.ics'
    })).resolves.toEqual({ sourcePath: '/tmp/calendar.ics' })
    expect(bridge.calendar.importGoogleFromPath).toHaveBeenCalledWith({
      sourcePath: '/tmp/calendar.ics'
    })

    await expect(adapter.call(API.CALENDAR_SYNC, {
      provider: 'google',
      options: { full: true }
    })).resolves.toEqual({ synced: true })
  })

  it('rejects unsupported providers explicitly', async() => {
    const { target } = createTarget()
    const adapter = createPlatformCompatibilityAdapter(target)
    await expect(adapter.call(API.CALENDAR_SYNC, { provider: 'icloud' }))
      .rejects.toMatchObject({ code: 'ELEPHANTNOTE_UNSUPPORTED_PROVIDER' })
  })

  it('routes generic model actions without exposing Hugging Face to callers', async() => {
    const { target, bridge } = createTarget()
    const adapter = createPlatformCompatibilityAdapter(target)

    await adapter.call(API.MODELS_SEARCH, { provider: 'huggingface', query: 'small model' })
    expect(bridge.models.searchHuggingFace).toHaveBeenCalledWith({
      provider: 'huggingface',
      query: 'small model'
    })

    await adapter.call(API.MODELS_ACQUIRE, { repoId: 'org/model' })
    expect(bridge.models.download).toHaveBeenCalledWith({ repoId: 'org/model' })
  })

  it('routes Atomic operations through the same action interface', async() => {
    const { target, bridge } = createTarget()
    const adapter = createPlatformCompatibilityAdapter(target)

    await adapter.call(API.ATOMIC_GRAPH, { vaultRoot: '/vault', options: { limit: 10 } })
    expect(bridge.atomicFeatures.graph).toHaveBeenCalledWith({
      vaultRoot: '/vault',
      options: { limit: 10 }
    })
  })

  it('normalizes progress events into transport-independent topics', () => {
    const { target, bridge, unlisten } = createTarget()
    const adapter = createPlatformCompatibilityAdapter(target)
    const listener = vi.fn()

    expect(adapter.subscribe(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)).toBe(unlisten)
    expect(bridge.models.onDownloadProgress).toHaveBeenCalledWith(listener)
  })

  it('fails with a typed error when a compatibility method is absent', async() => {
    const adapter = createPlatformCompatibilityAdapter({ elephantnote: { models: {} } })
    await expect(adapter.call(API.MODELS_LIST, {})).rejects.toMatchObject({
      code: 'ELEPHANTNOTE_COMPATIBILITY_METHOD_UNAVAILABLE'
    })
  })
})

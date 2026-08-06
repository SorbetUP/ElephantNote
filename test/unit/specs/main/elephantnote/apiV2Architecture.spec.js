import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  ELEPHANTNOTE_API_CONTRACT_REVISION,
  ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS,
  listApiContracts,
  validateApiPayload
} from 'common/elephantnote/apiContractsV2'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'
import { createPlatformCompatibilityAdapter } from 'elephant-front/services/elephantnoteClient/platformCompatibilityAdapter'
import { installTauriApiContractFacade } from '../../../../../src/renderer/src/platform/tauriApiContractFacade'

const root = process.cwd()

const listFrontendFiles = () => {
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (/\.(?:js|ts|vue)$/.test(entry.name)) files.push(filename)
    }
  }
  visit(path.resolve(root, 'Elephant/front/app'))
  return files
}

const createBridge = () => {
  const unsubscribe = vi.fn()
  return {
    calendar: {
      importGoogle: vi.fn(async() => ({ imported: true })),
      importGoogleFromPath: vi.fn(async(payload) => payload),
      googleConfigGet: vi.fn(async() => ({ calendarId: 'primary' })),
      googleConfigSet: vi.fn(async(config) => config),
      googleSync: vi.fn(async() => ({ synced: true }))
    },
    models: {
      list: vi.fn(async() => []),
      searchHuggingFace: vi.fn(async(payload) => ({ results: [payload.query] })),
      info: vi.fn(async(payload) => payload),
      download: vi.fn(async(payload) => payload),
      activate: vi.fn(async(payload) => payload),
      deactivate: vi.fn(async(payload) => payload),
      remove: vi.fn(async(payload) => payload),
      active: vi.fn(async() => null),
      cancelDownload: vi.fn(async(payload) => payload),
      downloadStatus: vi.fn(async(payload) => payload),
      refreshIndex: vi.fn(async() => true),
      onDownloadProgress: vi.fn(() => unsubscribe)
    },
    search: { concepts: vi.fn(async(payload) => payload) },
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
      onModelPullProgress: vi.fn(() => unsubscribe)
    },
    unsubscribe
  }
}

describe('ElephantNote API v2 architecture', () => {
  it('publishes a unique provider-neutral contract', () => {
    const names = listApiContracts().map(({ name }) => name)
    expect(ELEPHANTNOTE_API_CONTRACT_REVISION).toBe(2)
    expect(new Set(names).size).toBe(names.length)
    expect(API.CALENDAR_SYNC).toBe('calendar.sync')
    expect(API.MODELS_SEARCH).toBe('models.search')
    expect(API.ATOMIC_GRAPH).toBe('atomic.graph')
  })

  it('rejects malformed provider and model payloads before transport', () => {
    expect(() => validateApiPayload(API.CALENDAR_SYNC, {})).toThrow(/provider/i)
    expect(() => validateApiPayload(API.MODELS_ACQUIRE, { provider: 'huggingface' }))
      .toThrow(/identifier/i)
    expect(validateApiPayload(API.MODELS_ACQUIRE, { repoId: 'org/model' }))
      .toMatchObject({ repoId: 'org/model' })
  })

  it('routes every public domain through call and subscribe abstractions', async() => {
    const call = vi.fn(async() => ({}))
    const subscribe = vi.fn(() => vi.fn())
    const clients = createDomainClients(call, subscribe)

    await clients.calendar.sync('google', { full: true })
    await clients.models.search({ query: 'tiny' })
    await clients.search.concepts({ query: 'graph' })
    await clients.atomicFeatures.graph('/vault', { limit: 10 })
    clients.models.onDownloadProgress(vi.fn())

    expect(call).toHaveBeenCalledWith(API.CALENDAR_SYNC, {
      provider: 'google', options: { full: true }
    })
    expect(call).toHaveBeenCalledWith(API.MODELS_SEARCH, {
      provider: 'huggingface', query: 'tiny'
    })
    expect(call).toHaveBeenCalledWith(API.SEARCH_CONCEPTS, { query: 'graph' })
    expect(call).toHaveBeenCalledWith(API.ATOMIC_GRAPH, {
      vaultRoot: '/vault', options: { limit: 10 }
    })
    expect(subscribe).toHaveBeenCalledWith(EVENTS.MODELS_DOWNLOAD_PROGRESS, expect.any(Function))
  })

  it('isolates provider-specific implementations in the compatibility adapter', async() => {
    const bridge = createBridge()
    const adapter = createPlatformCompatibilityAdapter({ elephantnote: bridge })

    await expect(adapter.call(API.MODELS_SEARCH, {
      provider: 'huggingface', query: 'tiny'
    })).resolves.toEqual({ results: ['tiny'] })
    await expect(adapter.call(API.CALENDAR_SYNC, { provider: 'google' }))
      .resolves.toEqual({ synced: true })
    await expect(adapter.call(API.CALENDAR_SYNC, { provider: 'icloud' }))
      .rejects.toMatchObject({ code: 'ELEPHANTNOTE_UNSUPPORTED_PROVIDER' })
  })

  it('normalizes platform progress listeners into contract event topics', () => {
    const bridge = createBridge()
    const adapter = createPlatformCompatibilityAdapter({ elephantnote: bridge })
    const listener = vi.fn()
    expect(adapter.subscribe(EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)).toBe(bridge.unsubscribe)
    expect(bridge.models.onDownloadProgress).toHaveBeenCalledWith(listener)
  })

  it('makes the Tauri bridge advertise and execute the same contract', async() => {
    const bridge = createBridge()
    const originalCall = vi.fn(async(action, payload) => ({ ok: true, action, data: payload }))
    const target = {
      elephantnote: {
        ...bridge,
        api: {
          describe: vi.fn(async() => ({ version: 'rust-v1', actions: [API.VAULTS_GET] })),
          call: originalCall
        }
      }
    }

    expect(installTauriApiContractFacade(target)).toBe(true)
    const description = await target.elephantnote.api.describe()
    expect(description.contractRevision).toBe(2)
    expect(description.actions).toContain(API.MODELS_SEARCH)

    const result = await target.elephantnote.api.call(API.MODELS_SEARCH, {
      provider: 'huggingface', query: 'tiny'
    })
    expect(result).toMatchObject({ ok: true, data: { results: ['tiny'] } })
    expect(originalCall).not.toHaveBeenCalled()
  })

  it('forbids raw Tauri transport in portable frontend code', () => {
    const violations = listFrontendFiles()
      .filter((filename) => {
        const source = fs.readFileSync(filename, 'utf8')
        return source.includes('__TAURI__') || source.includes('.core.invoke(')
      })
      .map((filename) => path.relative(root, filename))
    expect(violations).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API, ELEPHANTNOTE_API_VERSION } from 'common/elephantnote/apiActions'
import { installTauriApiContractFacade } from '../../../src/renderer/src/platform/tauriApiContractFacade'

const targetWithBridge = () => {
  const originalCall = vi.fn(async(action, payload) => ({ ok: true, action, data: payload }))
  const target = {
    elephantnote: {
      api: {
        describe: vi.fn(async() => ({ version: 'legacy', actions: ['vaults.get'] })),
        call: originalCall
      },
      models: {
        searchHuggingFace: vi.fn(async(payload) => ({ results: [payload.query] })),
        onDownloadProgress: vi.fn(() => vi.fn())
      },
      calendar: {},
      search: {},
      atomicFeatures: {}
    }
  }
  return { target, originalCall }
}

describe('Tauri API contract facade', () => {
  it('advertises the complete versioned contract', async() => {
    const { target } = targetWithBridge()
    expect(installTauriApiContractFacade(target)).toBe(true)

    const description = await target.elephantnote.api.describe()
    expect(description.version).toBe(ELEPHANTNOTE_API_VERSION)
    expect(description.backendVersion).toBe('legacy')
    expect(description.actions).toContain(API.MODELS_SEARCH)
    expect(description.actions).toContain(API.ATOMIC_GRAPH)
    expect(description.actions).toContain(API.VAULTS_GET)
  })

  it('executes canonical provider actions through the platform adapter', async() => {
    const { target, originalCall } = targetWithBridge()
    installTauriApiContractFacade(target)

    await expect(target.elephantnote.api.call(API.MODELS_SEARCH, {
      provider: 'huggingface',
      query: 'tiny'
    })).resolves.toMatchObject({
      ok: true,
      data: { results: ['tiny'] }
    })
    expect(originalCall).not.toHaveBeenCalled()
  })

  it('delegates ordinary API actions to the original Tauri bridge', async() => {
    const { target, originalCall } = targetWithBridge()
    installTauriApiContractFacade(target)

    await target.elephantnote.api.call(API.VAULTS_GET, {})
    expect(originalCall).toHaveBeenCalledWith(API.VAULTS_GET, {})
  })

  it('returns typed envelopes instead of leaking platform exceptions', async() => {
    const { target } = targetWithBridge()
    installTauriApiContractFacade(target)

    const response = await target.elephantnote.api.call(API.CALENDAR_SYNC, {
      provider: 'google'
    })
    expect(response.ok).toBe(false)
    expect(response.error.code).toBe('ELEPHANTNOTE_COMPATIBILITY_METHOD_UNAVAILABLE')
  })

  it('is idempotent', () => {
    const { target } = targetWithBridge()
    expect(installTauriApiContractFacade(target)).toBe(true)
    const first = target.elephantnote.api
    expect(installTauriApiContractFacade(target)).toBe(true)
    expect(target.elephantnote.api).toBe(first)
  })
})

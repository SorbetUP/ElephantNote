import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiContractsV2'
import { createPlatformCompatibilityAdapter } from 'elephant-front/services/elephantnoteClient/platformCompatibilityAdapter'

describe('Atomic compatibility payload translation', () => {
  it.each([
    [API.ATOMIC_OVERVIEW, 'overview'],
    [API.ATOMIC_GRAPH, 'graph'],
    [API.ATOMIC_WIKI, 'wiki'],
    [API.ATOMIC_NOTE_AUTO_NAME, 'autoNameNote']
  ])('flattens options for %s', async(action, methodName) => {
    const method = vi.fn(async(payload) => payload)
    const target = {
      elephantnote: {
        atomicFeatures: { [methodName]: method }
      }
    }
    const adapter = createPlatformCompatibilityAdapter(target)

    await expect(adapter.call(action, {
      vaultRoot: '/vault',
      relativePath: 'Note.md',
      options: { limit: 12, force: true }
    })).resolves.toEqual({
      vaultRoot: '/vault',
      relativePath: 'Note.md',
      limit: 12,
      force: true
    })
    expect(method).toHaveBeenCalledWith({
      vaultRoot: '/vault',
      relativePath: 'Note.md',
      limit: 12,
      force: true
    })
  })

  it('keeps structured payloads structured when the legacy method already expects them', async() => {
    const summarize = vi.fn(async(payload) => payload)
    const adapter = createPlatformCompatibilityAdapter({
      elephantnote: { atomicFeatures: { summarize } }
    })
    const payload = {
      vaultRoot: '/vault',
      relativePath: 'Note.md',
      providerConfig: { provider: 'local' }
    }

    await expect(adapter.call(API.ATOMIC_SUMMARIZE, payload)).resolves.toEqual(payload)
    expect(summarize).toHaveBeenCalledWith(payload)
  })
})

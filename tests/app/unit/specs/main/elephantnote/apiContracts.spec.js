import { describe, expect, it } from 'vitest'
import { validateApiPayload } from 'common/elephantnote/apiContracts'

describe('ElephantNote API contracts', () => {
  it('accepts explicit valid sync.plan operations', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }

    expect(validateApiPayload('sync.plan', payload)).toBe(payload)
  })

  it('rejects unknown sync.plan operations instead of falling back to the default plan', () => {
    expect(() => validateApiPayload('sync.plan', { operations: ['delete-all'] })).toThrow(/operations/)
  })

  it('rejects non-array sync.plan operations', () => {
    expect(() => validateApiPayload('sync.plan', { operations: 'pull' })).toThrow(/operations/)
  })

  it('accepts local runtime AI config payloads used by the Tauri bridge', () => {
    const payload = {
      localRuntime: {
        llamaServerMode: 'bundled',
        llamaServerPath: '',
        llamaBaseUrl: 'http://127.0.0.1:11434'
      }
    }

    expect(validateApiPayload('ai.config.set', payload)).toBe(payload)
  })
})

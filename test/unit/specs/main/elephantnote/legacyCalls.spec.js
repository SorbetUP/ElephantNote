import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_CALLS } from '../../../../../Elephant/front/app/services/elephantnoteClient/legacyCalls.js'

const originalWindow = globalThis.window

const installBridge = (bridge) => {
  Object.defineProperty(globalThis, 'window', {
    value: { elephantnote: bridge },
    configurable: true,
    writable: true
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true
  })
})

describe('LEGACY_CALLS', () => {
  it('routes sync.plan to the bridge instead of dropping it', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }
    const plan = vi.fn((value) => ({ ok: true, value }))
    installBridge({ sync: { plan } })

    expect(LEGACY_CALLS['sync.plan'](payload)).toEqual({ ok: true, value: payload })
    expect(plan).toHaveBeenCalledWith(payload)
  })
})

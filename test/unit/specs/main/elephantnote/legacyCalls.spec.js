import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_CALLS } from '../../../../../Elephant/front/app/services/elephantnoteClient/legacyCalls.js'

const originalBridge = globalThis.window?.elephantnote

const installBridge = (bridge) => {
  globalThis.window.elephantnote = bridge
}

afterEach(() => {
  globalThis.window.elephantnote = originalBridge
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

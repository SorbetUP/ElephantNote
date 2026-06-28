import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiCaller } from '../../../../../../Elephant/frontend/app/services/elephantnoteClient/apiRuntime.js'

const originalBridge = globalThis.window?.elephantnote

afterEach(() => {
  globalThis.window.elephantnote = originalBridge
})

describe('ElephantNote API runtime', () => {
  it('validates payloads before dispatching to the public bridge API', async() => {
    const bridgeCall = vi.fn(async() => ({ ok: true, data: 'planned' }))
    globalThis.window.elephantnote = { api: { call: bridgeCall } }
    const call = createApiCaller({})

    await expect(call('sync.plan', { operations: ['pull'] })).resolves.toBe('planned')
    expect(bridgeCall).toHaveBeenCalledWith('sync.plan', { operations: ['pull'] })
  })

  it('rejects invalid payloads before they can reach the public bridge API', () => {
    const bridgeCall = vi.fn()
    globalThis.window.elephantnote = { api: { call: bridgeCall } }
    const call = createApiCaller({})

    expect(() => call('sync.plan', { operations: ['unknown'] })).toThrow(/operations/)
    expect(bridgeCall).not.toHaveBeenCalled()
  })

  it('rejects invalid payloads before they can reach local fallback calls', () => {
    const fallbackPlan = vi.fn()
    globalThis.window.elephantnote = null
    const call = createApiCaller({ 'sync.plan': fallbackPlan })

    expect(() => call('sync.plan', { operations: 'pull' })).toThrow(/operations/)
    expect(fallbackPlan).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPATIBILITY_CALLS } from '../../../../../../Elephant/frontend/app/services/elephantnoteClient/compatibilityCalls.js'

const originalBridge = globalThis.window?.elephantnote
const originalTauri = globalThis.window?.__TAURI__

const installBridge = (bridge) => {
  globalThis.window.elephantnote = bridge
}

const installTauriInvoke = (invoke) => {
  globalThis.window.__TAURI__ = { core: { invoke } }
}

const disableTauriInvoke = () => {
  globalThis.window.__TAURI__ = null
}

afterEach(() => {
  globalThis.window.elephantnote = originalBridge
  globalThis.window.__TAURI__ = originalTauri
})

describe('COMPATIBILITY_CALLS', () => {
  it('routes sync.plan to the bridge when Tauri invoke is unavailable', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }
    const plan = vi.fn((value) => ({ ok: true, value }))
    disableTauriInvoke()
    installBridge({ sync: { plan } })

    expect(COMPATIBILITY_CALLS['sync.plan'](payload)).toEqual({ ok: true, value: payload })
    expect(plan).toHaveBeenCalledWith(payload)
  })

  it('passes sync.plan payloads directly to the Tauri command when available', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }
    const invoke = vi.fn((command, value) => ({ command, value }))
    installTauriInvoke(invoke)

    expect(COMPATIBILITY_CALLS['sync.plan'](payload)).toEqual({
      command: 'tauri_sync_plan',
      value: { payloadByOperation: payload }
    })
    expect(invoke).toHaveBeenCalledWith('tauri_sync_plan', { payloadByOperation: payload })
  })

  it('normalizes non-object sync.plan payloads before dispatching to Tauri', () => {
    const invoke = vi.fn((command, value) => ({ command, value }))
    installTauriInvoke(invoke)

    expect(COMPATIBILITY_CALLS['sync.plan']('pull')).toEqual({
      command: 'tauri_sync_plan',
      value: { payloadByOperation: {} }
    })
    expect(invoke).toHaveBeenCalledWith('tauri_sync_plan', { payloadByOperation: {} })
  })
})

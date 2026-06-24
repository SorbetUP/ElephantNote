import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_CALLS } from '../../../../../Elephant/front/app/services/elephantnoteClient/legacyCalls.js'

const originalBridge = globalThis.window?.elephantnote
const originalTauri = globalThis.window?.__TAURI__

const installBridge = (bridge) => {
  globalThis.window.elephantnote = bridge
}

const installTauriInvoke = (invoke) => {
  globalThis.window.__TAURI__ = { core: { invoke } }
}

afterEach(() => {
  globalThis.window.elephantnote = originalBridge
  globalThis.window.__TAURI__ = originalTauri
})

describe('LEGACY_CALLS', () => {
  it('routes sync.plan to the bridge instead of dropping it', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }
    const plan = vi.fn((value) => ({ ok: true, value }))
    installBridge({ sync: { plan } })

    expect(LEGACY_CALLS['sync.plan'](payload)).toEqual({ ok: true, value: payload })
    expect(plan).toHaveBeenCalledWith(payload)
  })

  it('passes sync.plan payloads directly to the Tauri command when available', () => {
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }
    const invoke = vi.fn((command, value) => ({ command, value }))
    installTauriInvoke(invoke)

    expect(LEGACY_CALLS['sync.plan'](payload)).toEqual({
      command: 'tauri_sync_plan',
      value: { payloadByOperation: payload }
    })
    expect(invoke).toHaveBeenCalledWith('tauri_sync_plan', { payloadByOperation: payload })
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  installSubscriptionProviderBridge,
  SUBSCRIPTION_PROVIDER_ACTIONS
} from '../../../Elephant/frontend/src/renderer/src/platform/subscriptionProviderBridge.js'

const createTarget = () => {
  const invoke = vi.fn(async(command, payload) => ({ command, payload }))
  return {
    target: {
      __TAURI__: { core: { invoke } },
      elephantnote: {
        api: {
          describe: async() => ({ runtime: 'tauri', actions: ['existing.action'] }),
          call: async(action, payload) => ({ ok: true, data: { action, payload } })
        },
        ai: {}
      }
    },
    invoke
  }
}

describe('subscription provider bridge', () => {
  it('installs Codex and OpenCode providers without pretending failures are successes', async() => {
    const { target, invoke } = createTarget()
    expect(installSubscriptionProviderBridge(target)).toBe(true)

    await target.elephantnote.ai.codex.status()
    await target.elephantnote.ai.opencode.listModels({ endpoint: 'http://127.0.0.1:4096' })

    expect(invoke).toHaveBeenNthCalledWith(1, 'tauri_ai_runtime_status', { provider: 'codex' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'tauri_ai_models_list', {
      provider: 'opencode',
      endpoint: 'http://127.0.0.1:4096'
    })
  })

  it('exposes the provider actions through the shared API facade', async() => {
    const { target, invoke } = createTarget()
    installSubscriptionProviderBridge(target)

    const description = await target.elephantnote.api.describe()
    expect(description.actions).toEqual(expect.arrayContaining(SUBSCRIPTION_PROVIDER_ACTIONS))

    const response = await target.elephantnote.api.call('ai.auth.login.start', {
      provider: 'codex',
      flow: 'device'
    })
    expect(response.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('tauri_ai_auth_login_start', {
      provider: 'codex',
      flow: 'device'
    })
  })

  it('keeps unknown actions delegated to the previous API bridge', async() => {
    const { target } = createTarget()
    installSubscriptionProviderBridge(target)
    await expect(target.elephantnote.api.call('existing.action', { value: 1 })).resolves.toEqual({
      ok: true,
      data: { action: 'existing.action', payload: { value: 1 } }
    })
  })

  it('throws when the Tauri command API is missing', () => {
    const target = { elephantnote: { ai: {} } }
    installSubscriptionProviderBridge(target)
    expect(() => target.elephantnote.ai.codex.status()).toThrow('Tauri command API is unavailable')
  })
})

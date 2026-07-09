import { describe, expect, it, vi } from 'vitest'
import { installManagedRuntimeAutoinstall } from '../../../Elephant/frontend/src/renderer/src/platform/managedRuntimeAutoinstall.js'

describe('managed runtime autoinstall', () => {
  it('ensures Codex before checking its runtime status', async() => {
    const order = []
    const target = {
      elephantnote: {
        ai: {
          codex: {
            ensure: vi.fn(async() => { order.push('ensure') }),
            status: vi.fn(async() => { order.push('status'); return { ok: true } })
          },
          opencode: {}
        }
      }
    }

    expect(installManagedRuntimeAutoinstall(target)).toBe(true)
    await expect(target.elephantnote.ai.codex.status()).resolves.toEqual({ ok: true })
    expect(order).toEqual(['ensure', 'status'])
  })

  it('passes the OpenCode endpoint to the managed ensure command', async() => {
    const ensure = vi.fn(async() => ({ ok: true }))
    const status = vi.fn(async() => ({ ok: true }))
    const target = { elephantnote: { ai: { codex: {}, opencode: { ensure, status } } } }
    installManagedRuntimeAutoinstall(target)

    await target.elephantnote.ai.opencode.status({ endpoint: 'http://127.0.0.1:4096' })

    expect(ensure).toHaveBeenCalledWith({ endpoint: 'http://127.0.0.1:4096' })
    expect(status).toHaveBeenCalledWith({ endpoint: 'http://127.0.0.1:4096' })
  })

  it('does not double-wrap provider status', async() => {
    const ensure = vi.fn(async() => ({ ok: true }))
    const status = vi.fn(async() => ({ ok: true }))
    const target = { elephantnote: { ai: { codex: { ensure, status }, opencode: {} } } }
    installManagedRuntimeAutoinstall(target)
    installManagedRuntimeAutoinstall(target)

    await target.elephantnote.ai.codex.status()

    expect(ensure).toHaveBeenCalledOnce()
    expect(status).toHaveBeenCalledOnce()
  })
})

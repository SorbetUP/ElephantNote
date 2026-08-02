import { describe, expect, it, vi } from 'vitest'

import { createRustCanonicalReadiness } from '../../../../../Elephant/frontend/src/renderer/src/muya/rustCanonicalReadiness.js'

const withTimeout = (promise, timeoutMs = 100) => Promise.race([
  promise,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error('canonical readiness timed out')), timeoutMs)
  })
])

describe('Rust canonical editor readiness', () => {
  it('does not wait for a stalled clipboard refresh after the canonical reset', async() => {
    const reset = vi.fn(async() => ({ revision: 1 }))
    const refreshClipboard = vi.fn(() => new Promise(() => {}))

    const ready = createRustCanonicalReadiness({
      previousReady: Promise.resolve(),
      reset,
      refreshClipboard
    })

    await expect(withTimeout(ready)).resolves.toEqual({ revision: 1 })
    expect(reset).toHaveBeenCalledTimes(1)
    expect(refreshClipboard).toHaveBeenCalledTimes(1)
  })

  it('reports clipboard failures without changing canonical readiness', async() => {
    const clipboardError = new Error('clipboard unavailable')
    const reportClipboardError = vi.fn()

    const ready = createRustCanonicalReadiness({
      previousReady: Promise.resolve(),
      reset: async() => ({ revision: 2 }),
      refreshClipboard: async() => { throw clipboardError },
      reportClipboardError
    })

    await expect(ready).resolves.toEqual({ revision: 2 })
    await vi.waitFor(() => {
      expect(reportClipboardError).toHaveBeenCalledWith(clipboardError)
    })
  })

  it('keeps reset failures blocking and does not query clipboard', async() => {
    const resetError = new Error('Rust reset failed')
    const refreshClipboard = vi.fn()

    const ready = createRustCanonicalReadiness({
      previousReady: Promise.resolve(),
      reset: async() => { throw resetError },
      refreshClipboard
    })

    await expect(ready).rejects.toBe(resetError)
    expect(refreshClipboard).not.toHaveBeenCalled()
  })
})

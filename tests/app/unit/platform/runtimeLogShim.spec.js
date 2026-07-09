import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete globalThis.__TAURI__
  vi.restoreAllMocks()
  vi.resetModules()
})

const loadLogger = async(invoke) => {
  globalThis.__TAURI__ = { core: { invoke } }
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return (await import('../../../../Elephant/frontend/src/renderer/src/platform/runtimeLogShim.js')).default
}

describe('Graph terminal logging', () => {
  it('forwards structured Graph logs to tauri_debug_log', async() => {
    const invoke = vi.fn(async() => true)
    const logger = await loadLogger(invoke)

    logger.info('[Graph][Territory] layout:complete', {
      territoryCount: 3,
      overlapNotes: 2
    })
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    expect(invoke).toHaveBeenCalledWith('tauri_debug_log', {
      level: 'info',
      message: '[Graph][Territory] layout:complete',
      details: {
        territoryCount: 3,
        overlapNotes: 2
      }
    })
  })

  it('does not forward unrelated application logs', async() => {
    const invoke = vi.fn(async() => true)
    const logger = await loadLogger(invoke)

    logger.info('[vault] load:done', { entries: 12 })
    await Promise.resolve()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('sanitizes Error objects before forwarding', async() => {
    const invoke = vi.fn(async() => true)
    const logger = await loadLogger(invoke)

    logger.error('[Graph][Data] inspect:error', new Error('database unavailable'))
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    expect(invoke.mock.calls[0][1].details).toEqual({
      error: 'database unavailable',
      name: 'Error'
    })
  })
})

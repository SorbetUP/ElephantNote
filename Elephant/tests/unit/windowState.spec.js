import { beforeEach, describe, expect, it, vi } from 'vitest'

const windowStateMocks = vi.hoisted(() => ({
  restoreStateCurrent: vi.fn(),
  saveWindowState: vi.fn()
}))

vi.mock('@tauri-apps/plugin-window-state', () => ({
  restoreStateCurrent: windowStateMocks.restoreStateCurrent,
  saveWindowState: windowStateMocks.saveWindowState,
  StateFlags: { ALL: 63 }
}))

describe('portable window state bridge', () => {
  beforeEach(() => {
    vi.resetModules()
    windowStateMocks.restoreStateCurrent.mockReset()
    windowStateMocks.saveWindowState.mockReset()
    window.__TAURI__ = {}
  })

  it('restores and saves window state only in a portable runtime', async() => {
    windowStateMocks.restoreStateCurrent.mockResolvedValue(undefined)
    windowStateMocks.saveWindowState.mockResolvedValue(undefined)

    const { restorePortableWindowState, savePortableWindowState } = await import(
      '../../../src/renderer/src/platform/windowState.js'
    )

    await expect(restorePortableWindowState()).resolves.toBe(true)
    await expect(savePortableWindowState()).resolves.toBe(true)

    expect(windowStateMocks.restoreStateCurrent).toHaveBeenCalledWith(63)
    expect(windowStateMocks.saveWindowState).toHaveBeenCalledWith(63)
  })
})

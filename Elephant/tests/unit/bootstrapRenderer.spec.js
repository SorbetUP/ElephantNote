import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('bootstrap renderer', () => {
  beforeEach(() => {
    vi.resetModules()
    window.__MARKTEXT_USER_DATA_PATH__ = '/tmp/elephant-user-data'
    window.__MARKTEXT_WINDOW_ID__ = 1
    window.__MARKTEXT_WINDOW_TYPE__ = 'editor'
    window.rgPath = '/usr/bin/rg'
    window.history.replaceState({}, '', '/')
    global.marktext = {}
  })

  it('boots without electron url params and defaults to the editor route', async() => {
    const { default: bootstrapRenderer } = await import(
      '../../../src/renderer/src/bootstrap.js'
    )

    expect(() => bootstrapRenderer()).not.toThrow()
    expect(global.marktext.env).toEqual(
      expect.objectContaining({
        type: 'editor',
        windowId: 1
      })
    )
    expect(global.marktext.paths.userDataPath).toBe('/tmp/elephant-user-data')
  })
})

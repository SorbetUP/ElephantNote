import { beforeEach, describe, expect, it, vi } from 'vitest'
const preferenceStore = {
  SET_SINGLE_PREFERENCE: vi.fn()
}

const windowApi = {
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  setFullscreen: vi.fn(),
  isFullscreen: vi.fn()
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi
}))

vi.mock('../../../src/renderer/src/store', () => ({
  default: {},
}))

vi.mock('../../../src/renderer/src/store/preferences', () => ({
  usePreferencesStore: () => preferenceStore
}))

describe('tauri window commands', () => {
  beforeEach(() => {
    vi.resetModules()
    windowApi.minimize.mockReset()
    windowApi.maximize.mockReset()
    windowApi.unmaximize.mockReset()
    windowApi.setFullscreen.mockReset()
    windowApi.isFullscreen.mockReset()
    window.__TAURI__ = {}
    delete window.electron
    window.path = {
      join: (...parts) => parts.filter(Boolean).join('/')
    }
    window.fileUtils = {
      isFile: vi.fn(() => false)
    }
    preferenceStore.SET_SINGLE_PREFERENCE.mockReset()
  })

  it('uses the tauri window API for minimize and fullscreen toggling', async() => {
    windowApi.isFullscreen.mockResolvedValueOnce(false)
    windowApi.isFullscreen.mockResolvedValueOnce(true)

    const { default: commands } = await import('../../../src/renderer/src/commands/index.js')

    const minimizeCommand = commands.find((command) => command.id === 'window.minimize')
    const fullscreenCommand = commands.find((command) => command.id === 'window.toggle-full-screen')

    await minimizeCommand.execute()
    await fullscreenCommand.execute()
    await fullscreenCommand.execute()

    expect(windowApi.minimize).toHaveBeenCalledTimes(1)
    expect(windowApi.setFullscreen).toHaveBeenNthCalledWith(1, true)
    expect(windowApi.setFullscreen).toHaveBeenNthCalledWith(2, false)
    expect(windowApi.maximize).not.toHaveBeenCalled()
    expect(windowApi.unmaximize).not.toHaveBeenCalled()
  })

  it('updates preferences directly for theme and text direction commands', async() => {
    const { default: commands } = await import('../../../src/renderer/src/commands/index.js')

    const themeCommand = commands.find((command) => command.id === 'window.change-theme')
    const directionCommand = commands.find((command) => command.id === 'view.text-direction')

    await themeCommand.executeSubcommand(null, 'dark')
    await directionCommand.executeSubcommand(null, 'rtl')

    expect(preferenceStore.SET_SINGLE_PREFERENCE).toHaveBeenNthCalledWith(1, {
      type: 'theme',
      value: 'dark'
    })
    expect(preferenceStore.SET_SINGLE_PREFERENCE).toHaveBeenNthCalledWith(2, {
      type: 'textDirection',
      value: 'rtl'
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPathFacade, installRuntimeBridge } from '../../../src/renderer/src/platform/runtimeBridge.js'

const { currentWindowApi, webviewWindowCtor } = vi.hoisted(() => ({
  currentWindowApi: {
    close: vi.fn(async() => {}),
    isAlwaysOnTop: vi.fn(async() => false),
    setAlwaysOnTop: vi.fn(async() => {})
  },
  webviewWindowCtor: function WebviewWindowMock(label, options) {
    webviewWindowCtor.calls.push({ label, options })
    this.label = 'mock-window'
    this.requestedLabel = label
    this.options = options
  }
}))
webviewWindowCtor.calls = []
const tauriDialog = vi.hoisted(() => ({ open: vi.fn() }))
const tauriOpener = vi.hoisted(() => ({
  openUrl: vi.fn(async() => {}),
  openPath: vi.fn(async() => {}),
  revealItemInDir: vi.fn(async() => {})
}))
const tauriClipboard = vi.hoisted(() => ({
  writeText: vi.fn(async() => {}),
  readText: vi.fn(async() => 'clipboard')
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => currentWindowApi
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: webviewWindowCtor
}))

vi.mock('@tauri-apps/plugin-dialog', () => tauriDialog)

vi.mock('@tauri-apps/plugin-opener', () => tauriOpener)

vi.mock('@tauri-apps/plugin-clipboard-manager', () => tauriClipboard)

describe('runtime bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    webviewWindowCtor.calls = []
    window.localStorage.clear()
    delete window.tauri
    delete window.path
    delete window.commandExists
    delete window.fileUtils
    delete window.i18nUtils
    delete window.elephantnote
    delete window.__TAURI__
    tauriDialog.open.mockImplementation(async(options = {}) => {
      if (options.directory) return '/tmp/project'
      return ['/tmp/demo.md']
    })
    tauriOpener.openUrl.mockResolvedValue()
    tauriOpener.openPath.mockResolvedValue()
    tauriOpener.revealItemInDir.mockResolvedValue()
    tauriClipboard.writeText.mockResolvedValue()
    tauriClipboard.readText.mockResolvedValue('clipboard')
  })

  it('exposes a deterministic path facade', () => {
    const path = createPathFacade()

    expect(path.join('/tmp', 'vault', '..', 'notes', 'note.md')).toBe('/tmp/notes/note.md')
    expect(path.dirname('/tmp/notes/note.md')).toBe('/tmp/notes')
    expect(path.basename('/tmp/notes/note.md')).toBe('note.md')
    expect(path.basename('/tmp/notes/note.md', '.md')).toBe('note')
    expect(path.extname('/tmp/notes/note.md')).toBe('.md')
    expect(path.relative('/tmp/vault', '/tmp/vault/notes/note.md')).toBe('notes/note.md')
    expect(path.isAbsolute('/tmp/vault/notes/note.md')).toBe(true)
  })

  it('installs a minimal compatibility surface when tauri is missing', async() => {
    const surface = installRuntimeBridge(window)

    expect(surface).toEqual({ mode: 'tauri-compatible', installed: true })
    expect(window.tauri).toBeDefined()
    expect(window.path).toBeDefined()
    expect(window.commandExists.exists('node')).toBe(false)
    expect(window.webUtils).toBeUndefined()

    const listener = vi.fn()
    const unlisten = window.tauri.ipcRenderer.on('mt::bridge-test', listener)

    window.tauri.ipcRenderer.send('mt::bridge-test', 'payload', { id: 1 })
    expect(listener).toHaveBeenCalledWith(expect.any(Object), 'payload', { id: 1 })

    unlisten()
    window.tauri.ipcRenderer.send('mt::bridge-test', 'ignored')
    expect(listener).toHaveBeenCalledTimes(1)

    await expect(window.tauri.clipboard.writeText('hello')).resolves.toBeUndefined()
    expect(window.tauri.webUtils.getPathForFile({ path: '/tmp/example.md' }))
      .toBe('/tmp/example.md')
  })

  it('prefers a tauri runtime when available', async() => {
    const emit = vi.fn()
    const invoke = vi.fn(async(_channel, payload) => payload)

    window.__TAURI__ = {
      core: {
        invoke
      },
      event: {
        emit,
        listen: vi.fn(async() => () => {})
      },
      opener: {
        openUrl: tauriOpener.openUrl,
        openPath: vi.fn(async(pathname) => pathname)
      },
      clipboard: {
        writeText: vi.fn(async() => {}),
        readText: vi.fn(async() => 'clipboard')
      },
      fs: {
        stat: vi.fn(async() => ({ isFile: true, isDirectory: false }))
      }
    }
    window.fileUtils = {
      readFile: vi.fn(async() => '# title'),
      isSamePathSync: (pathA, pathB) => pathA === pathB,
      hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
      MARKDOWN_INCLUSIONS: ['.md'],
      isChildOfDirectory: () => false
    }

    const surface = installRuntimeBridge(window)

    expect(surface).toEqual({ mode: 'tauri', installed: true })
    const listener = vi.fn()
    window.tauri.ipcRenderer.on('mt::bridge-local', listener)
    window.tauri.ipcRenderer.send('mt::bridge-local', 'payload')
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(expect.any(Object), 'payload')
    })

    const openNewTab = vi.fn()
    window.tauri.ipcRenderer.on('mt::open-new-tab', openNewTab)
    const openDirectory = vi.fn()
    window.tauri.ipcRenderer.on('mt::open-directory', openDirectory)
    const notificationListener = vi.fn()
    const updateListener = vi.fn()
    window.tauri.ipcRenderer.on('mt::show-notification', notificationListener)
    window.tauri.ipcRenderer.on('mt::UPDATE_NOT_AVAILABLE', updateListener)

    await expect(window.tauri.ipcRenderer.invoke('example', { id: 1 }))
      .resolves.toEqual({ id: 1 })
    await expect(window.tauri.shell.openExternal('https://example.com'))
      .resolves.toBeUndefined()
    expect(tauriOpener.openUrl).toHaveBeenCalledWith('https://example.com')
    await expect(window.tauri.clipboard.writeText('hello')).resolves.toBeUndefined()
    await expect(window.tauri.shell.exec('picgo', ['u', '/tmp/image.png']))
      .resolves.toEqual({
        command: 'picgo',
        args: ['u', '/tmp/image.png'],
        cwd: null,
        env: null
      })
    expect(invoke).toHaveBeenCalledWith('shell_exec', {
      command: 'picgo',
      args: ['u', '/tmp/image.png'],
      cwd: null,
      env: null
    })

    window.tauri.ipcRenderer.send('mt::cmd-open-file')
    window.tauri.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
    window.tauri.ipcRenderer.send('mt::window-toggle-always-on-top')
    window.tauri.ipcRenderer.send('mt::cmd-new-editor-window')
    window.tauri.ipcRenderer.send('mt::cmd-close-window')
    window.tauri.ipcRenderer.send('mt::check-for-update')
    window.tauri.ipcRenderer.send('mt::make-screenshot')

    await vi.waitFor(() => {
      expect(tauriDialog.open).toHaveBeenCalled()
      expect(openNewTab).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          pathname: '/tmp/demo.md',
          filename: 'demo.md',
          markdown: '# title'
        }),
        {},
        true
      )
      expect(openDirectory).toHaveBeenCalledWith(expect.any(Object), '/tmp/project')
      expect(webviewWindowCtor.calls).toHaveLength(1)
      expect(webviewWindowCtor.calls[0].label).toMatch(/^editor-/)
      expect(currentWindowApi.setAlwaysOnTop).toHaveBeenCalledWith(true)
      expect(currentWindowApi.close).toHaveBeenCalled()
      expect(notificationListener).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: 'Screenshot',
          type: 'warning'
        })
      )
      expect(updateListener).toHaveBeenCalledWith(
        expect.any(Object),
        'Update checks are not configured in the Tauri bridge.'
      )
    })
  })

  it('handles renderer-side invoke commands in tauri mode', async() => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async(channel, payload) => {
          if (channel === 'shell_exec') {
            return {
              success: true,
              stdout: '# imported title\n\nbody',
              stderr: '',
              status: 0
            }
          }
          return { channel, payload }
        })
      },
      fs: {
        remove: vi.fn(async() => {})
      }
    }
    installRuntimeBridge(window)

    window.localStorage.setItem('elephantnote:tauri:language', 'fr')
    window.localStorage.setItem(
      'elephantnote:tauri:user-keybindings',
      JSON.stringify({ 'file.save': 'Ctrl+Alt+S' })
    )

    await expect(window.tauri.ipcRenderer.invoke('mt::get-current-language')).resolves.toBe('fr')

    const keybindings = await window.tauri.ipcRenderer.invoke('mt::keybinding-get-pref-keybindings')
    expect(keybindings.defaultKeybindings.get('file.save')).toBeTruthy()
    expect(keybindings.userKeybindings.get('file.save')).toBe('Ctrl+Alt+S')

    await expect(
      window.tauri.ipcRenderer.invoke('mt::keybinding-save-user-keybindings', new Map([['file.save', 'Ctrl+S']]))
    ).resolves.toBe(true)
    expect(JSON.parse(window.localStorage.getItem('elephantnote:tauri:user-keybindings'))).toEqual({
      'file.save': 'Ctrl+S'
    })

    await expect(window.tauri.ipcRenderer.invoke('mt::spellchecker-set-enabled', true))
      .resolves.toBe(true)
    await expect(window.tauri.ipcRenderer.invoke('mt::spellchecker-switch-language', 'de-DE'))
      .resolves.toBeNull()
    await expect(window.tauri.ipcRenderer.invoke('mt::spellchecker-get-available-dictionaries'))
      .resolves.toEqual(['en-US'])
    await expect(window.tauri.ipcRenderer.invoke('mt::spellchecker-get-custom-dictionary-words'))
      .resolves.toEqual([])

    tauriDialog.open.mockResolvedValue('/tmp/image.png')
    await expect(window.tauri.ipcRenderer.invoke('mt::ask-for-image-path'))
      .resolves.toBe('/tmp/image.png')

    const openNewTab = vi.fn()
    window.tauri.ipcRenderer.on('mt::open-new-tab', openNewTab)

    tauriDialog.open.mockResolvedValueOnce('/tmp/import.docx')
    window.tauri.ipcRenderer.send('mt::cmd-import-file')
    window.tauri.ipcRenderer.send('mt::window::drop', ['/tmp/import.docx', '/tmp/notes.md'])

    await vi.waitFor(() => {
      expect(openNewTab).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          pathname: '/tmp/import.docx',
          filename: 'import.docx',
          markdown: '# imported title\n\nbody'
        }),
        {},
        true
      )
      expect(openNewTab).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          pathname: '/tmp/notes.md',
          filename: 'notes.md'
        }),
        {},
        true
      )
    })
  })

  it('persists and broadcasts preferences through the tauri bridge', async() => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async(channel, payload) => ({ channel, payload }))
      }
    }
    installRuntimeBridge(window)

    const preferenceListener = vi.fn()
    const languageListener = vi.fn()
    window.tauri.ipcRenderer.on('mt::user-preference', preferenceListener)
    window.tauri.ipcRenderer.on('language-changed', languageListener)

    window.tauri.ipcRenderer.send('mt::set-user-preference', {
      language: 'de',
      theme: 'dark'
    })
    window.tauri.ipcRenderer.send('mt::ask-for-user-preference')

    expect(
      JSON.parse(
        window.localStorage.getItem('elephantnote:tauri:preferences') ||
          window.__TAURI_BRIDGE_STORAGE__.get('elephantnote:tauri:preferences')
      )
    ).toEqual({
      language: 'de',
      theme: 'dark'
    })
    expect(preferenceListener).toHaveBeenCalledWith(expect.any(Object), {
      language: 'de',
      theme: 'dark'
    })
    expect(languageListener).toHaveBeenCalledWith(expect.any(Object), 'de')

    window.tauri.ipcRenderer.send('mt::cmd-toggle-autosave')
    expect(
      JSON.parse(
        window.localStorage.getItem('elephantnote:tauri:preferences') ||
          window.__TAURI_BRIDGE_STORAGE__.get('elephantnote:tauri:preferences')
      )
    ).toEqual({
      language: 'de',
      theme: 'dark',
      autoSave: true
    })
  })

  it('persists buffered state snapshots in tauri mode', async() => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async(channel, payload) => ({ channel, payload }))
      }
    }
    installRuntimeBridge(window)

    await expect(
      window.tauri.ipcRenderer.invoke('update-buffer-state', {
        version: 1,
        editor: { tabs: [] }
      })
    ).resolves.toBe(true)

    const raw =
      window.localStorage.getItem('elephantnote:tauri:buffer-state') ||
      window.__TAURI_BRIDGE_STORAGE__.get('elephantnote:tauri:buffer-state')
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      editor: { tabs: [] }
    })
  })
})

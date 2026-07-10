import { describe, expect, it, vi } from 'vitest'
import { getRelativeVaultPath, installTauriLocalIpcBridge } from '@/platform/tauriLocalIpcBridge'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

const createTarget = ({
  vaultRoot = '/Users/sorbet/Documents/New project 2',
  bridgeVaultRoot = vaultRoot,
  nativeVaultRoot = vaultRoot,
  notePayload = { markdown: 'Hello from disk' }
} = {}) => {
  const target = new EventTarget()
  const nativeSend = vi.fn()
  const read = vi.fn(async() => notePayload)
  const invoke = vi.fn(async(command) => command === 'tauri_vaults_get'
    ? { activeVault: nativeVaultRoot ? { path: nativeVaultRoot } : null }
    : undefined)

  target.__TAURI__ = { core: { invoke } }
  target.tauri = { ipcRenderer: { send: nativeSend } }
  target.elephantnote = {
    getVaults: vi.fn(async() => ({ activeVault: bridgeVaultRoot ? { path: bridgeVaultRoot } : null })),
    notes: { read }
  }

  return { target, nativeSend, read, invoke }
}

describe('Tauri local IPC bridge', () => {
  it('opens a vault note through notes.read even when target.path is unavailable', async() => {
    const { target, nativeSend, read } = createTarget()
    const opened = []
    target.addEventListener('mt::open-new-tab', (event) => opened.push(event.detail))

    expect(installTauriLocalIpcBridge(target)).toBe(true)
    target.tauri.ipcRenderer.send('mt::open-file', '/Users/sorbet/Documents/New project 2/test_keep/Note.md', {})
    await flushPromises()

    expect(nativeSend).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledWith({ relativePath: 'test_keep/Note.md' })
    expect(opened).toHaveLength(1)
    expect(opened[0][0]).toMatchObject({
      pathname: '/Users/sorbet/Documents/New project 2/test_keep/Note.md',
      filename: 'Note.md',
      markdown: 'Hello from disk',
      isMixedLineEndings: false
    })
  })

  it('uses unfiltered Rust vault state when the mobile bridge hides the private vault', async() => {
    const privateVault = '/data/user/0/com.elephantnote.app/vaults/Personal'
    const { target, nativeSend, read, invoke } = createTarget({
      bridgeVaultRoot: '',
      nativeVaultRoot: privateVault
    })
    const opened = []
    target.addEventListener('mt::open-new-tab', (event) => opened.push(event.detail))

    installTauriLocalIpcBridge(target)
    target.tauri.ipcRenderer.send(
      'mt::open-file',
      `${privateVault}/Daily/2026-07-09.md`,
      {}
    )
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('tauri_vaults_get')
    expect(read).toHaveBeenCalledWith({ relativePath: 'Daily/2026-07-09.md' })
    expect(nativeSend).not.toHaveBeenCalled()
    expect(opened).toHaveLength(1)
  })

  it('accepts an already relative Markdown path without introducing traversal', () => {
    const target = {}
    expect(getRelativeVaultPath(target, '/vault', 'Daily/2026-07-10.md')).toBe('Daily/2026-07-10.md')
    expect(getRelativeVaultPath(target, '/vault', '../outside.md')).toBe('')
  })

  it('falls back to native IPC for files outside the active vault', async() => {
    const { target, nativeSend, read } = createTarget({ vaultRoot: '/Users/sorbet/Documents/Vault' })
    const opened = []
    target.addEventListener('mt::open-new-tab', (event) => opened.push(event.detail))

    installTauriLocalIpcBridge(target)
    target.tauri.ipcRenderer.send('mt::open-file', '/Users/sorbet/Documents/Other/Note.md', { flag: true })
    await flushPromises()

    expect(read).not.toHaveBeenCalled()
    expect(opened).toHaveLength(0)
    expect(nativeSend).toHaveBeenCalledWith('mt::open-file', '/Users/sorbet/Documents/Other/Note.md', { flag: true })
  })

  it('keeps renderer-local save events local and does not call native IPC', () => {
    const { target, nativeSend } = createTarget()
    const dispatched = []
    target.addEventListener('mt::response-file-save', (event) => dispatched.push(event.detail))

    installTauriLocalIpcBridge(target)
    target.tauri.ipcRenderer.send('mt::response-file-save', 'tab-1', 'Note.md', '/vault/Note.md', 'body')

    expect(nativeSend).not.toHaveBeenCalled()
    expect(dispatched).toEqual([['tab-1', 'Note.md', '/vault/Note.md', 'body']])
  })
})

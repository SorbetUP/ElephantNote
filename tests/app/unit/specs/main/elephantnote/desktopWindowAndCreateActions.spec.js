import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const titleBar = read('Elephant/frontend/app/components/shell/TopVaultBar.vue')
const libraryToolbar = read('Elephant/frontend/app/components/library/LibraryToolbar.vue')
const linuxConfig = JSON.parse(read('Elephant/backend/tauri/tauri.linux.conf.json'))

describe('desktop shell controls and creation actions', () => {
  it('provides explicit controls for the frameless Linux window', () => {
    const mainWindow = linuxConfig.app?.windows?.[0] || linuxConfig.tauri?.windows?.[0]

    expect(mainWindow?.decorations).toBe(false)
    expect(titleBar).toContain("import { getCurrentWindow } from '@tauri-apps/api/window'")
    expect(titleBar).toContain('v-if="!isMac"')
    expect(titleBar).toContain('aria-label="Minimize window"')
    expect(titleBar).toContain('aria-label="Close window"')
    expect(titleBar).toContain('getCurrentWindow().minimize()')
    expect(titleBar).toContain('await win.maximize()')
    expect(titleBar).toContain('await win.unmaximize()')
    expect(titleBar).toContain('getCurrentWindow().close()')
    expect(titleBar).toContain('-webkit-app-region: no-drag')
  })

  it('keeps note and folder creation visible in the main library toolbar', () => {
    expect(libraryToolbar).toContain('New note')
    expect(libraryToolbar).toContain('New folder')
    expect(libraryToolbar).toContain('FilePlus2')
    expect(libraryToolbar).toContain('FolderPlus')
    expect(libraryToolbar).toContain('store.createNote()')
    expect(libraryToolbar).toContain('store.createFolder()')
    expect(libraryToolbar).toContain(':disabled="isBusy || !store.hasVault"')
    expect(libraryToolbar).toContain('role="alert"')
  })
})

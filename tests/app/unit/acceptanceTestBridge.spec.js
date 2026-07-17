import { describe, expect, it, vi } from 'vitest'
import { installAcceptanceTestBridge } from '../../../Elephant/frontend/src/renderer/src/platform/acceptanceTestBridge.js'

describe('renderer acceptance test bridge', () => {
  it('opens, edits, saves and reads the displayed note state', async() => {
    const target = {
      document: document.implementation.createHTMLDocument('acceptance'),
      console,
      __ELEPHANT_DEBUG_LOGS__: []
    }
    const surface = target.document.createElement('div')
    surface.setAttribute('contenteditable', 'true')
    surface.textContent = 'Initial note'
    target.document.body.append(surface)

    const editorStore = {
      currentFile: { id: 'test-1', pathname: '', markdown: '', isSaved: true, history: null, cursor: null },
      FILE_SAVE: vi.fn(function() { this.currentFile.isSaved = true })
    }
    const vaultStore = {
      activeVault: { path: '/vault' },
      openedNotePath: '',
      entries: [{ path: 'Inbox/Acceptance.md', title: 'Acceptance' }],
      rootEntries: [],
      openNote(entry) {
        this.openedNotePath = entry.path
        editorStore.currentFile.pathname = entry.path
        editorStore.currentFile.markdown = '# Initial'
        editorStore.currentFile.id = 'test-1'
      }
    }

    const api = installAcceptanceTestBridge({ target, editorStore, vaultStore })
    await expect(api.openNote('Inbox/Acceptance.md')).resolves.toMatchObject({
      notePath: 'Inbox/Acceptance.md',
      markdown: '# Initial'
    })
    api.setMarkdown('# Updated\n\nSecond line')
    surface.textContent = 'Updated\n\nSecond line'
    await expect(api.save()).resolves.toMatchObject({ isSaved: true, markdown: '# Updated\n\nSecond line' })
    expect(api.readDisplayed()).toMatchObject({
      notePath: 'Inbox/Acceptance.md',
      displayedText: 'Updated\n\nSecond line'
    })
    expect(api.logs().map((entry) => entry.event)).toEqual(expect.arrayContaining([
      'installed', 'open:start', 'open:done', 'edit:set-markdown', 'save:start', 'save:done', 'read:displayed'
    ]))
  })
})


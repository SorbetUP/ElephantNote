import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRuntimeImageHandlers } from '../../../../../Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditorImages'

describe('Elephant Rust runtime image integration', () => {
  let dispatch
  let storeImage
  let editorStore
  let handlers

  beforeEach(() => {
    dispatch = vi.fn(async () => true)
    storeImage = vi.fn(async () => 'https://cdn.example/image.png')
    editorStore = { SHOW_IMAGE_DELETION_URL: vi.fn() }
    Object.defineProperty(window, 'DIRNAME', {
      configurable: true,
      value: '/vault'
    })
    Object.defineProperty(window, 'tauri', {
      configurable: true,
      value: {
        webUtils: {
          getPathForFile: vi.fn(() => '/native/image.png')
        }
      }
    })
    handlers = createRuntimeImageHandlers({
      currentFile: { value: { pathname: '/vault/note.md' } },
      projectTree: { value: { pathname: '/vault' } },
      preferencesStore: { $state: {} },
      sourceCode: { value: false },
      editorStore,
      dispatch,
      storeImage
    })
  })

  it('stores the first dropped image then inserts the final source', async () => {
    const text = { name: 'notes.txt', type: 'text/plain' }
    const image = { name: 'diagram.png', type: 'image/png' }

    await expect(handlers.dropped([text, image])).resolves.toBe(true)

    expect(window.tauri.webUtils.getPathForFile).toHaveBeenCalledWith(image)
    expect(storeImage).toHaveBeenCalledWith('/native/image.png', null, 'diagram.png')
    expect(dispatch).toHaveBeenCalledWith('insert-image', {
      source: 'https://cdn.example/image.png',
      alt: 'diagram.png'
    })
  })

  it('ignores drops without an image file', async () => {
    await expect(
      handlers.dropped([{ name: 'notes.txt', type: 'text/plain' }])
    ).resolves.toBe(false)
    expect(storeImage).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('routes uploaded images and preserves their deletion URL', async () => {
    await handlers.uploaded('https://cdn.example/upload.png', 'https://delete.example/token')

    expect(dispatch).toHaveBeenCalledWith('insert-image', {
      src: 'https://cdn.example/upload.png',
      source: 'https://cdn.example/upload.png'
    })
    expect(editorStore.SHOW_IMAGE_DELETION_URL).toHaveBeenCalledWith(
      'https://delete.example/token'
    )
  })
})

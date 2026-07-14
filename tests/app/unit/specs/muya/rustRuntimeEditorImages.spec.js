import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRuntimeImageHandlers } from '../../../../../Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditorImages'

describe('Elephant Rust runtime image integration', () => {
  let dispatch
  let storeImage
  let validateImageUrl
  let editorStore
  let handlers

  beforeEach(() => {
    dispatch = vi.fn(async () => true)
    storeImage = vi.fn(async () => 'https://cdn.example/image.png')
    validateImageUrl = vi.fn(async () => true)
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
      storeImage,
      validateImageUrl
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

  it('inserts a validated image URI without storing a local file', async () => {
    const source = 'https://example.com/diagram.png'

    await expect(handlers.uriDropped(source)).resolves.toBe(true)

    expect(validateImageUrl).toHaveBeenCalledWith(source)
    expect(storeImage).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith('insert-image', {
      source,
      alt: ''
    })
  })

  it('rejects a URI that is not an image', async () => {
    validateImageUrl.mockResolvedValue(false)

    await expect(handlers.uriDropped('https://example.com/page')).resolves.toBe(false)

    expect(dispatch).not.toHaveBeenCalled()
  })
})

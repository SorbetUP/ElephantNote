import { beforeEach, describe, expect, it, vi } from 'vitest'

import loadImageAsync from '../../../../Elephant/frontend/src/muya/lib/parser/render/renderInlines/loadImageAsync.js'

beforeEach(() => {
  document.body.innerHTML = ''
  window.fileUtils = {
    pathExistsSync: vi.fn(() => true),
    readFile: vi.fn(async() => new Uint8Array([1, 2, 3]))
  }
})

describe('loadImageAsync', () => {
  it('loads local Excalidraw assets through a native file URL instead of a blob URL', async() => {
    const wrapper = document.createElement('div')
    const imageText = document.createElement('span')
    imageText.className = 'ag-image-loading'
    wrapper.appendChild(imageText)
    document.body.appendChild(wrapper)

    const originalQuerySelector = document.querySelector.bind(document)
    document.querySelector = (selector) => {
      if (String(selector || '').startsWith('#')) return imageText
      return originalQuerySelector(selector)
    }

    try {
      const context = {
        loadImageMap: new Map(),
        urlMap: new Map()
      }

      const result = loadImageAsync.call(
        context,
        { src: '/vault/.assets/excalidraw-demo.png' },
        {},
        'ag-image',
        'ag-image'
      )

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      const insertedImage = wrapper.querySelector('img')

      expect(result.domsrc).toMatch(/^file:\/\/\/vault\/\.assets\/excalidraw-demo\.png\?msec=/)
      expect(insertedImage).toBeTruthy()
      expect(insertedImage.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
      expect(insertedImage.dataset.localResolvedPath).toBe('/vault/.assets/excalidraw-demo.png')
      expect(window.fileUtils.readFile).toHaveBeenCalledWith('/vault/.assets/excalidraw-demo.png')

      insertedImage.dispatchEvent(new Event('load'))

      const reopened = loadImageAsync.call(
        context,
        { src: '/vault/.assets/excalidraw-demo.png' },
        {},
        'ag-image',
        'ag-image'
      )

      expect(reopened.isSuccess).toBe(true)
      expect(reopened.domsrc).toMatch(/^data:image\/png;base64,/)
      expect(window.fileUtils.readFile).toHaveBeenCalledTimes(1)
    } finally {
      document.querySelector = originalQuerySelector
    }
  })
})

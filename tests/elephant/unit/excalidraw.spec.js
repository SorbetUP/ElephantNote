import { describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import {
  createInitialExcalidrawData,
  ensureExcalidrawName,
  ensurePngName,
  getExcalidrawPreviewPath,
  getExcalidrawSidecarPath,
  resolveExcalidrawModule
} from '@/elephantnote/services/excalidraw'

describe('ElephantNote Excalidraw helpers', () => {
  it('normalizes drawing and image output names', () => {
    expect(ensurePngName('sketch')).toBe('sketch.png')
    expect(ensurePngName('sketch.png')).toBe('sketch.png')
    expect(ensureExcalidrawName('scene')).toBe('scene.excalidraw')
    expect(ensureExcalidrawName('scene.excalidraw')).toBe('scene.excalidraw')
  })

  it('derives the editable sidecar path from generated previews', () => {
    const originalPath = window.path
    window.path = {
      extname: (pathname) => pathname.match(/\.[^/.]+$/)?.[0] || ''
    }

    expect(getExcalidrawSidecarPath('/vault/note/sketch.png')).toBe('/vault/note/sketch.excalidraw')
    expect(getExcalidrawSidecarPath('/vault/note/sketch')).toBe('/vault/note/sketch.excalidraw')
    expect(getExcalidrawPreviewPath('/vault/note/sketch.excalidraw')).toBe('/vault/note/sketch.png')

    window.path = originalPath
  })

  it('starts with an empty scene when no source file is selected', async() => {
    const data = await createInitialExcalidrawData({
      blob: null,
      theme: 'dark'
    })

    expect(data.elements).toEqual([])
    expect(data.files).toEqual({})
    expect(data.appState.viewBackgroundColor).toBe('#121212')
  })

  it('resolves both native and default Excalidraw package exports', () => {
    const nativeModule = { Excalidraw: function NativeExcalidraw() {} }
    const defaultModule = { default: { Excalidraw: function DefaultExcalidraw() {} } }

    expect(resolveExcalidrawModule(nativeModule)).toBe(nativeModule)
    expect(resolveExcalidrawModule(defaultModule)).toBe(defaultModule.default)
    expect(() => resolveExcalidrawModule({ default: {} })).toThrow('Excalidraw could not be loaded')
  })

  it('uses React 18 root mounting and avoids invalid image element fields', async() => {
    const dialog = await fs.readFile(path.resolve('Elephant/frontend/app/components/editor/ExcalidrawDialog.vue'), 'utf8')
    const service = await fs.readFile(path.resolve('Elephant/frontend/app/services/excalidraw.js'), 'utf8')

    expect(dialog).toContain("import { createRoot } from 'react-dom/client'")
    expect(dialog).toContain('markRaw(createRoot(mountEl.value))')
    expect(dialog).not.toContain('ReactDOM.render')
    expect(dialog).not.toContain('unmountComponentAtNode')
    expect(service).not.toContain('index: null')
  })
})

import { describe, expect, it } from 'vitest'
import {
  createInitialExcalidrawData,
  ensureExcalidrawName,
  ensurePngName,
  resolveExcalidrawModule
} from '@/elephantnote/services/excalidraw'

describe('ElephantNote Excalidraw helpers', () => {
  it('normalizes drawing and image output names', () => {
    expect(ensurePngName('sketch')).toBe('sketch.png')
    expect(ensurePngName('sketch.png')).toBe('sketch.png')
    expect(ensureExcalidrawName('scene')).toBe('scene.excalidraw')
    expect(ensureExcalidrawName('scene.excalidraw')).toBe('scene.excalidraw')
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
})

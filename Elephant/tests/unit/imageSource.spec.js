import { describe, expect, it } from 'vitest'
import {
  getImageBaseDirectory,
  normalizeInsertedImageSource,
  resolveLocalImageSource,
  toFileUrl
} from '../../../src/renderer/src/util/imageSource.js'

describe('imageSource utilities', () => {
  it('resolves local image paths against a base directory', () => {
    expect(resolveLocalImageSource('assets/pic.png', '/vault/notes')).toBe('/vault/notes/assets/pic.png')
  })

  it('normalizes local image sources into file URLs', () => {
    const url = normalizeInsertedImageSource('images/my pic.png', '/vault/notes')

    expect(url).toMatch(/^file:\/\//)
    expect(url).toContain('my%20pic.png')
  })

  it('normalizes absolute local image paths into file URLs', () => {
    const url = normalizeInsertedImageSource('/vault/notes/my image.png', '/vault/notes')

    expect(url).toMatch(/^file:\/\//)
    expect(url).toContain('my%20image.png')
  })

  it('resolves encoded file URLs back into local paths', () => {
    expect(resolveLocalImageSource('file:///Users/test/My%20Image.png')).toBe('/Users/test/My Image.png')
  })

  it('round-trips file paths into file URLs', () => {
    expect(toFileUrl('/Users/test/My Image.png')).toMatch(/^file:\/\//)
  })

  it('resolves the current note directory before falling back to the workspace root', () => {
    expect(getImageBaseDirectory('/vault/notes/todo.md', '/fallback')).toBe('/vault/notes')
    expect(getImageBaseDirectory('', '/fallback')).toBe('/fallback')
  })
})

import { describe, expect, it } from 'vitest'
import {
  getImageBaseDirectory,
  normalizeInsertedImageSource,
  resolveLocalImageSource,
  toFileUrl,
  toMarkdownImageSource
} from '../../../src/renderer/src/util/imageSource.js'

describe('imageSource utilities', () => {
  it('resolves local image paths against a base directory', () => {
    expect(resolveLocalImageSource('assets/pic.png', '/vault/notes')).toBe('/vault/notes/assets/pic.png')
  })

  it('preserves external URLs, including query strings', () => {
    expect(resolveLocalImageSource('https://example.test/image.png?token=abc#preview', '/vault/notes')).toBe('https://example.test/image.png?token=abc#preview')
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

  it('resolves Windows file URLs without a fake leading slash', () => {
    expect(resolveLocalImageSource('file:///C:/Users/test/My%20Image.png')).toBe('C:/Users/test/My Image.png')
  })

  it('round-trips file paths into file URLs', () => {
    expect(toFileUrl('/Users/test/My Image.png')).toMatch(/^file:\/\//)
  })

  it('formats note-local markdown image sources as relative URLs', () => {
    expect(toMarkdownImageSource('/vault/notes/assets/My Image (1).png', '/vault/notes')).toBe('assets/My%20Image%20%281%29.png')
  })

  it('keeps existing relative markdown image sources relative', () => {
    expect(toMarkdownImageSource('./assets/My Image.png', '/vault/notes')).toBe('./assets/My%20Image.png')
  })

  it('falls back to file URLs for absolute images outside the note directory', () => {
    expect(toMarkdownImageSource('/vault/shared/My Image.png', '/vault/notes')).toBe('file:///vault/shared/My%20Image.png')
  })

  it('resolves the current note directory before falling back to the workspace root', () => {
    expect(getImageBaseDirectory('/vault/notes/todo.md', '/fallback')).toBe('/vault/notes')
    expect(getImageBaseDirectory('', '/fallback')).toBe('/fallback')
  })
})

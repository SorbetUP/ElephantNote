import { describe, expect, it } from 'vitest'
import pathShim, { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from '../../../src/renderer/src/platform/nodePathShim.js'

describe('nodePathShim', () => {
  it('resolves relative image paths without the Node path module', () => {
    expect(resolve('/vault/notes', 'images/picture.png')).toBe('/vault/notes/images/picture.png')
    expect(resolve('/vault/notes', '../assets/picture.png')).toBe('/vault/assets/picture.png')
  })

  it('provides the path API shape used by Muya image rendering', () => {
    expect(pathShim.resolve('/vault', 'note.png')).toBe('/vault/note.png')
    expect(join('/vault/', 'nested', 'note.md')).toBe('/vault/nested/note.md')
    expect(normalize('/vault//nested/../note.md')).toBe('/vault/note.md')
    expect(dirname('/vault/note.md')).toBe('/vault')
    expect(basename('/vault/note.md')).toBe('note.md')
    expect(extname('/vault/note.md')).toBe('.md')
    expect(isAbsolute('/vault/note.md')).toBe(true)
    expect(relative('/vault/notes', '/vault/assets/image.png')).toBe('../assets/image.png')
  })
})

import { describe, expect, it } from 'vitest'

import {
  markdownAnchorSlug,
  resolveInternalNoteLink
} from '../../../Elephant/frontend/app/components/editor/internalNoteLinks.js'

describe('internal Wiki note links', () => {
  it('resolves a generated Wiki citation relative to the hidden Wiki file', () => {
    expect(resolveInternalNoteLink({
      href: '../../Notes/Iroh%20guide.md#direct-connections',
      currentNotePath: '.elephantnote/wiki/iroh.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toEqual({ path: 'Notes/Iroh guide.md', anchor: 'direct-connections' })
  })

  it('accepts same-origin rendered markdown URLs but rejects external pages', () => {
    expect(resolveInternalNoteLink({
      href: 'http://127.0.0.1:1420/Notes/A.md#part-one',
      currentNotePath: '.elephantnote/wiki/topic.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toEqual({ path: 'Notes/A.md', anchor: 'part-one' })
    expect(resolveInternalNoteLink({
      href: 'https://example.com/Notes/A.md',
      currentNotePath: '.elephantnote/wiki/topic.md',
      appOrigin: 'http://127.0.0.1:1420'
    })).toBeNull()
  })

  it('normalizes heading anchors consistently', () => {
    expect(markdownAnchorSlug('Direct connections & Réseau')).toBe('direct-connections-reseau')
  })
})

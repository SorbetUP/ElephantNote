import { describe, expect, it } from 'vitest'
import {
  deleteMarkdownTag,
  parseMarkdownTags,
  renameMarkdownTag,
  updateMarkdownTags
} from '../../../../src/renderer/src/elephantnote/utils/markdownTags'

describe('markdownTags', () => {
  const baseMarkdown = `---
title: "Untitled"
type: "note"
tags: ["getting-started", "draft"]
createdAt: "2026-05-19T12:00:00.000Z"
updatedAt: "2026-05-19T12:00:00.000Z"
---

# Untitled

Body text.
`

  it('parses tags from frontmatter', () => {
    expect(parseMarkdownTags(baseMarkdown)).toEqual(['getting-started', 'draft'])
  })

  it('creates and updates the tags list', () => {
    const next = updateMarkdownTags(baseMarkdown, ['getting-started', 'ideas', 'draft'], 'Untitled')
    expect(parseMarkdownTags(next)).toEqual(['getting-started', 'ideas', 'draft'])
    expect(next).toContain('tags: ["getting-started", "ideas", "draft"]')
  })

  it('renames an existing tag', () => {
    const next = renameMarkdownTag(baseMarkdown, 'draft', 'review', 'Untitled')
    expect(parseMarkdownTags(next)).toEqual(['getting-started', 'review'])
  })

  it('deletes a tag', () => {
    const next = deleteMarkdownTag(baseMarkdown, 'getting-started', 'Untitled')
    expect(parseMarkdownTags(next)).toEqual(['draft'])
  })

  it('parses YAML block tags and quoted commas', () => {
    const markdown = `---
title: "Research"
tags:
  - "#ideas"
  - "needs, review"
---

# Research
`

    expect(parseMarkdownTags(markdown)).toEqual(['ideas', 'needs, review'])
  })
})

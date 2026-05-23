import { describe, expect, it } from 'vitest'
import {
  ensureNoteDocument,
  getDocumentTitle,
  mergeEditorMarkdown,
  renameDocumentTitle,
  toEditorMarkdown
} from '../../../../src/renderer/src/elephantnote/utils/noteDocument'

const documentMarkdown = [
  '---',
  'title: "Project plan"',
  'type: "note"',
  'tags: ["work"]',
  'createdAt: "2026-05-17T23:43:04.008Z"',
  'updatedAt: "2026-05-17T23:43:04.008Z"',
  '---',
  '',
  '# Project plan',
  '',
  'Body text'
].join('\n')

describe('ElephantNote noteDocument', () => {
  it('keeps frontmatter out of the editor markdown', () => {
    expect(toEditorMarkdown(documentMarkdown)).toBe('Body text')
  })

  it('rehydrates editor markdown before saving', () => {
    const nextMarkdown = mergeEditorMarkdown(documentMarkdown, 'Updated body')

    expect(nextMarkdown).toContain('title: "Project plan"')
    expect(nextMarkdown).toContain('tags: ["work"]')
    expect(nextMarkdown).toContain('# Project plan')
    expect(nextMarkdown).toContain('Updated body')
  })

  it('does not inject the title heading into an empty note body', () => {
    const emptyDocument = ensureNoteDocument('', 'Empty note')

    expect(emptyDocument).toContain('title: "Empty note"')
    expect(emptyDocument).not.toContain('# Empty note')
    expect(toEditorMarkdown(emptyDocument)).toBe('')
  })

  it('keeps an empty note body empty when saving', () => {
    const emptyDocument = ensureNoteDocument('', 'Empty note')
    const nextMarkdown = mergeEditorMarkdown(emptyDocument, '')

    expect(nextMarkdown).toContain('title: "Empty note"')
    expect(nextMarkdown).not.toContain('# Empty note')
  })

  it('renames both frontmatter and visible heading', () => {
    const nextMarkdown = renameDocumentTitle(documentMarkdown, 'Roadmap')

    expect(getDocumentTitle(nextMarkdown)).toBe('Roadmap')
    expect(nextMarkdown).toContain('title: "Roadmap"')
    expect(nextMarkdown).toContain('# Roadmap')
    expect(nextMarkdown).not.toContain('# Project plan')
  })
})

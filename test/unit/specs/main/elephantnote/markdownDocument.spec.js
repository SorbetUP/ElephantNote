import { describe, expect, it } from 'vitest'
import {
  mergeEditorMarkdown,
  renameDocumentTitle,
  toEditorMarkdown,
  updateMarkdownTags
} from 'common/elephantnote/markdownDocument'

describe('ElephantNote markdown document helpers', () => {
  it('shows body text in the editor without frontmatter or duplicated title heading', () => {
    const document = [
      '---',
      'title: "Project note"',
      'type: "note"',
      'tags: []',
      '---',
      '',
      '# Project note',
      '',
      'The visible body must stay editable.'
    ].join('\n')

    expect(toEditorMarkdown(document, 'Project note')).toBe('The visible body must stay editable.')
  })

  it('preserves the body when editor text is merged back into the stored document', () => {
    const currentDocument = [
      '---',
      'title: "Daily"',
      'type: "note"',
      'tags: []',
      '---',
      '',
      '# Daily',
      '',
      'Old body'
    ].join('\n')

    const result = mergeEditorMarkdown(currentDocument, 'New body', 'Daily')

    expect(result).toContain('title: "Daily"')
    expect(result).toContain('# Daily')
    expect(result).toContain('New body')
    expect(result).not.toContain('Old body')
  })

  it('renames frontmatter and heading together to avoid list/editor title drift', () => {
    const currentDocument = [
      '---',
      'title: "Old title"',
      'type: "note"',
      'tags: []',
      '---',
      '',
      '# Old title',
      '',
      'Body'
    ].join('\n')

    const result = renameDocumentTitle(currentDocument, 'New title')

    expect(result).toContain('title: "New title"')
    expect(result).toContain('# New title')
    expect(result).toContain('Body')
    expect(result).not.toContain('# Old title')
  })

  it('updates tags without dropping the note body', () => {
    const currentDocument = [
      '---',
      'title: "Tagged"',
      'type: "note"',
      'tags:',
      '  - old',
      '---',
      '',
      '# Tagged',
      '',
      'Body'
    ].join('\n')

    const result = updateMarkdownTags(currentDocument, ['new', 'urgent'], 'Tagged')

    expect(result).toContain('tags: ["new", "urgent"]')
    expect(result).toContain('# Tagged')
    expect(result).toContain('Body')
    expect(result).not.toContain('  - old')
  })
})

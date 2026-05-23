import { describe, expect, it } from 'vitest'
import {
  getNoteCardExcerpt,
  getNoteCardTitle,
  getNoteCardTypeLabel,
  getNoteCardUpdatedLabel
} from '@/elephantnote/utils/noteCardView'

describe('ElephantNote note card view model', () => {
  it('normalizes note card labels', () => {
    expect(getNoteCardTitle({ title: '  Welcome  ' })).toBe('Welcome')
    expect(getNoteCardTitle({ title: '' })).toBe('Untitled')
    expect(getNoteCardTypeLabel({ type: 'article' })).toBe('article')
    expect(getNoteCardTypeLabel({})).toBe('Note')
    expect(getNoteCardExcerpt({ excerpt: '  Preview text  ' })).toBe('Preview text')
    expect(getNoteCardExcerpt({ excerpt: '' })).toBe('No preview yet.')
  })

  it('formats the updated date for the note card footer', () => {
    expect(getNoteCardUpdatedLabel({ updatedAt: '2026-05-18T00:00:00.000Z' })).toBe('2026-05-18')
  })
})

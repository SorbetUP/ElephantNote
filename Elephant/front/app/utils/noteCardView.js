import { formatShortDate } from '../services/markdownMetaService'

const cardTitleFromName = (entry) => String(entry?.name || entry?.filename || '').replace(/\.md$/i, '')

const cleanPreview = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const mark = ['-', '-', '-'].join('')
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() === mark) {
    const closeIndex = lines.slice(1).findIndex((line) => line.trim() === mark)
    if (closeIndex >= 0) return lines.slice(closeIndex + 2).join('\n').trim()
  }
  if (raw.startsWith(mark)) {
    const closeIndex = raw.indexOf(mark, mark.length)
    if (closeIndex >= 0) return raw.slice(closeIndex + mark.length).trim()
  }
  return raw
}

export const getNoteCardTitle = (entry) => entry?.title?.trim() || cardTitleFromName(entry) || 'Untitled'

export const getNoteCardTypeLabel = (entry) => entry?.type?.trim() || 'Note'

export const getNoteCardUpdatedLabel = (entry) => formatShortDate(entry?.updatedAt)

export const getNoteCardExcerpt = (entry) => cleanPreview(entry?.excerpt || entry?.markdown || entry?.content).replace(/^#{1,6}\s+/, '').trim() || 'No preview yet.'

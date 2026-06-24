import { formatShortDate } from '../services/markdownMetaService'

const cardTitleFromName = (entry) => String(entry?.name || entry?.filename || '').replace(/\.md$/i, '')

const FRONTMATTER_KEYS = new Set([
  'title',
  'type',
  'tags',
  'createdAt',
  'updatedAt',
  'created',
  'updated',
  'id'
])

const looksLikeInlineFrontmatter = (line = '') => {
  const value = String(line || '').trim()
  if (!value.startsWith('---')) return false
  const metadata = value.replace(/^---\s*/, '').trim()
  if (!metadata) return true
  const keyMatch = metadata.match(/^([A-Za-z][\w-]*):\s*/)
  return !!keyMatch && FRONTMATTER_KEYS.has(keyMatch[1])
}

const stripInlineFrontmatterPrefix = (value = '') => {
  const raw = String(value || '').trim()
  if (!looksLikeInlineFrontmatter(raw)) return raw

  const closedInline = raw.match(/^---\s+.*?\s+---\s*(.*)$/)
  if (closedInline) return closedInline[1].trim()

  const knownKeyPattern = Array.from(FRONTMATTER_KEYS).join('|')
  const metadataPairPattern = new RegExp(
    `(?:^|\\s)(?:${knownKeyPattern}):\\s*(?:"[^"]*"|'[^']*'|\\[[^\\]]*\\]|[^\\s]+)`,
    'gi'
  )
  const matches = [...raw.matchAll(metadataPairPattern)]
  if (!matches.length) return raw.replace(/^---\s*/, '').trim()

  const last = matches[matches.length - 1]
  const end = Number(last.index || 0) + last[0].length
  return raw.slice(end).replace(/^\s*---\s*/, '').trim()
}

const stripFrontmatter = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const mark = ['-', '-', '-'].join('')
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() === mark) {
    const closeIndex = lines.slice(1).findIndex((line) => line.trim() === mark)
    if (closeIndex >= 0) return lines.slice(closeIndex + 2).join('\n').trim()
  }
  return stripInlineFrontmatterPrefix(raw)
}

const stripLeadingDocumentTitle = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const lines = raw.split(/\r?\n/)
  if (/^#\s+\S/.test(lines[0] || '') && lines.slice(1).some((line) => line.trim())) {
    return lines.slice(1).join('\n').trim()
  }

  return raw.replace(/^#{1,6}\s+/, '').trim()
}

const cleanPreview = (value) => stripLeadingDocumentTitle(stripFrontmatter(value))

export const getNoteCardTitle = (entry) => entry?.title?.trim() || cardTitleFromName(entry) || 'Untitled'

export const getNoteCardTypeLabel = (entry) => entry?.type?.trim() || 'Note'

export const getNoteCardUpdatedLabel = (entry) => formatShortDate(entry?.updatedAt)

export const getNoteCardExcerpt = (entry) => cleanPreview(entry?.excerpt || entry?.markdown || entry?.content) || 'No preview yet.'

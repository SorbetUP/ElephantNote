const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const serializeFrontmatterValue = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(', ')}]`
  }
  return `"${String(value).replace(/"/g, '\\"')}"`
}

export const parseFrontmatter = (markdown = '') => {
  const content = String(markdown || '')
  const match = content.match(frontmatterPattern)
  if (!match) {
    return {
      raw: '',
      fields: {},
      body: content
    }
  }

  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) continue
    fields[fieldMatch[1]] = fieldMatch[2].trim().replace(/^"|"$/g, '')
  }

  return {
    raw: match[0].trimEnd(),
    fields,
    body: content.slice(match[0].length)
  }
}

export const getDocumentTitle = (markdown = '', fallback = 'Untitled') => {
  const { fields, body } = parseFrontmatter(markdown)
  const headingTitle = body.match(/^#\s+(.+)$/m)?.[1]
  return fields.title || headingTitle || fallback || 'Untitled'
}

export const stripDisplayedTitle = (markdown = '', title = '') => {
  const escapedTitle = escapeRegExp(title || '')
  if (!escapedTitle) return String(markdown || '').replace(/^\s+/, '')
  return String(markdown || '')
    .replace(new RegExp(`^\\s*#\\s+${escapedTitle}\\s*\\n+`, 'i'), '')
    .replace(/^\s+/, '')
}

export const toEditorMarkdown = (markdown = '', fallbackTitle = 'Untitled') => {
  const title = getDocumentTitle(markdown, fallbackTitle)
  const { body } = parseFrontmatter(markdown)
  return stripDisplayedTitle(body, title)
}

export const getEditorMarkdownStats = (markdown = '') => {
  const content = String(markdown || '').trim()
  const words = content.length === 0 ? [] : content.split(/\s+/).filter(Boolean)
  return {
    word: words.length,
    character: Array.from(String(markdown || '')).length
  }
}

const composeNoteDocument = (rawFrontmatter, title, body = '') => {
  const normalizedBody = stripDisplayedTitle(body, title).trim()
  if (!normalizedBody) return rawFrontmatter
  return `${rawFrontmatter}\n\n# ${title}\n\n${normalizedBody}`.trimEnd()
}

export const ensureNoteDocument = (markdown = '', title = 'Untitled') => {
  const content = String(markdown || '')
  const normalizedTitle = String(title || '').trim() || 'Untitled'
  if (content.startsWith('---\n')) {
    return content.replace(/^type:\s*.*$/m, `type: ${serializeFrontmatterValue('note')}`)
  }

  const now = new Date().toISOString()
  const rawFrontmatter = [
    '---',
    `title: ${serializeFrontmatterValue(normalizedTitle)}`,
    `type: ${serializeFrontmatterValue('note')}`,
    'tags: []',
    `createdAt: ${serializeFrontmatterValue(now)}`,
    `updatedAt: ${serializeFrontmatterValue(now)}`,
    '---'
  ].join('\n')

  return composeNoteDocument(rawFrontmatter, normalizedTitle, content)
}

export const mergeEditorMarkdown = (currentDocument = '', editorMarkdown = '', fallbackTitle = 'Untitled') => {
  const title = getDocumentTitle(currentDocument, fallbackTitle)
  const base = ensureNoteDocument(currentDocument, title)
  const { raw } = parseFrontmatter(base)
  return composeNoteDocument(raw, title, editorMarkdown)
}

export const renameDocumentTitle = (markdown = '', nextTitle = 'Untitled') => {
  const title = String(nextTitle || '').trim() || 'Untitled'
  const base = ensureNoteDocument(markdown, title)
  const { raw, body } = parseFrontmatter(base)
  const nextFrontmatter = raw.replace(/^title:\s*.*$/m, `title: ${serializeFrontmatterValue(title)}`)
  const nextBody = stripDisplayedTitle(body, getDocumentTitle(markdown, title))
  return composeNoteDocument(nextFrontmatter, title, nextBody)
}

export const getDocumentCreatedAt = (markdown = '') => parseFrontmatter(markdown).fields.createdAt || ''

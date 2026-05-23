const frontmatterPattern = /^---\n([\s\S]*?)\n---\n?/

const normalizeTag = (tag) =>
  String(tag || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')

const serializeTag = (tag) => `"${String(tag).replace(/"/g, '\\"')}"`

const splitInlineTagList = (value = '') => {
  const items = []
  let current = ''
  let quote = ''
  let escaped = false

  for (const char of String(value || '')) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char
      current += char
      continue
    }
    if (char === quote) {
      quote = ''
      current += char
      continue
    }
    if (char === ',' && !quote) {
      items.push(current)
      current = ''
      continue
    }
    current += char
  }

  items.push(current)
  return items
}

const parseTagList = (value = '') => {
  const content = String(value || '').trim()
  if (!content) return []
  const list = content.startsWith('[') && content.endsWith(']')
    ? content.slice(1, -1)
    : content

  return splitInlineTagList(list)
    .map((item) => normalizeTag(item.replace(/^"|"$/g, '')))
    .filter(Boolean)
}

export const parseMarkdownTags = (markdown = '') => {
  const frontmatterMatch = String(markdown || '').match(frontmatterPattern)
  if (!frontmatterMatch) return []

  const lines = frontmatterMatch[1].split(/\r?\n/)
  const tagsIndex = lines.findIndex((line) => /^tags:\s*/.test(line))
  if (tagsIndex < 0) return []

  const inlineValue = lines[tagsIndex].replace(/^tags:\s*/, '')
  if (inlineValue.trim()) return parseTagList(inlineValue)

  const blockTags = []
  for (let index = tagsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break
    const match = line.match(/^\s*-\s*(.+?)\s*$/)
    if (!match) continue
    const tag = normalizeTag(match[1])
    if (tag) blockTags.push(tag)
  }
  return blockTags
}

export const updateMarkdownTags = (markdown = '', nextTags = [], title = 'Untitled') => {
  const normalizedTitle = String(title || '').trim() || 'Untitled'
  const uniqueTags = [...new Set(nextTags.map(normalizeTag).filter(Boolean))]
  const tagsLine = `tags: [${uniqueTags.map(serializeTag).join(', ')}]`
  const content = String(markdown || '')
  const frontmatterMatch = content.match(frontmatterPattern)

  if (!frontmatterMatch) {
    const body = content.replace(/^\s+/, '')
    return [
      '---',
      `title: "${normalizedTitle.replace(/"/g, '\\"')}"`,
      'type: "note"',
      tagsLine,
      '---',
      '',
      `# ${normalizedTitle}`,
      '',
      body
    ].join('\n').trimEnd()
  }

  const frontmatterBody = frontmatterMatch[1]
  const lines = frontmatterBody.split(/\r?\n/)
  const tagsIndex = lines.findIndex((line) => /^tags:\s*/.test(line))

  if (tagsIndex >= 0) {
    lines[tagsIndex] = tagsLine
  } else {
    const insertAfter = lines.findIndex((line) => /^(title|type|createdAt|updatedAt):\s*/.test(line))
    if (insertAfter >= 0) {
      lines.splice(insertAfter + 1, 0, tagsLine)
    } else {
      lines.unshift(tagsLine)
    }
  }

  return `---\n${lines.join('\n')}\n---\n${content.slice(frontmatterMatch[0].length).replace(/^\n+/, '')}`.trimEnd()
}

export const renameMarkdownTag = (markdown = '', fromTag = '', toTag = '', title = 'Untitled') => {
  const currentTags = parseMarkdownTags(markdown)
  const source = normalizeTag(fromTag)
  const target = normalizeTag(toTag)
  if (!source || !target) return markdown
  const nextTags = currentTags.map((tag) => (tag === source ? target : tag))
  return updateMarkdownTags(markdown, nextTags, title)
}

export const deleteMarkdownTag = (markdown = '', tag = '', title = 'Untitled') => {
  const currentTags = parseMarkdownTags(markdown)
  const target = normalizeTag(tag)
  if (!target) return markdown
  return updateMarkdownTags(
    markdown,
    currentTags.filter((currentTag) => currentTag !== target),
    title
  )
}

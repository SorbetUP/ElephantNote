const TEXT_NODE = 3
const ELEMENT_NODE = 1

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'blockquote', 'pre', 'table'])

const normalizedText = (value) => String(value || '').replace(/\r\n?/g, '\n')
const escapeLinkDestination = (value) => String(value || '').replace(/[()\\]/g, '\\$&')
const escapeImageAlt = (value) => String(value || '').replace(/[\\\]]/g, '\\$&')
const elementTag = (node) => node?.nodeType === ELEMENT_NODE ? node.tagName.toLowerCase() : ''
const isWhitespaceText = (node) => node?.nodeType === TEXT_NODE && !String(node.data || '').trim()

const imageMarkdown = (node) => {
  const source = node.getAttribute('src') || ''
  if (!source) return ''
  const alt = escapeImageAlt(node.getAttribute('alt') || '')
  const title = node.getAttribute('title')
  const serializedTitle = title ? ` "${String(title).replace(/"/g, '\\"')}"` : ''
  return `![${alt}](${escapeLinkDestination(source)}${serializedTitle})`
}

const inlineChildren = (node) => Array.from(node.childNodes).map(inlineMarkdown).join('')

const inlineMarkdown = (node) => {
  if (node.nodeType === TEXT_NODE) return normalizedText(node.data)
  if (node.nodeType !== ELEMENT_NODE) return ''

  const tag = elementTag(node)
  if (tag === 'img') return imageMarkdown(node)
  const content = inlineChildren(node)
  switch (tag) {
    case 'strong':
    case 'b':
      return `**${content}**`
    case 'em':
    case 'i':
      return `*${content}*`
    case 'del':
    case 's':
    case 'strike':
      return `~~${content}~~`
    case 'code': {
      const delimiter = content.includes('`') ? '``' : '`'
      return `${delimiter}${content}${delimiter}`
    }
    case 'a': {
      const href = node.getAttribute('href')
      return href ? `[${content}](${escapeLinkDestination(href)})` : content
    }
    case 'br':
      return '\n'
    default:
      return content
  }
}

const listItemMarkdown = (item, marker) => {
  let content = ''
  const nested = []
  for (const child of item.childNodes) {
    const tag = elementTag(child)
    if (tag === 'ul' || tag === 'ol') {
      const rendered = listMarkdown(child)
      if (rendered) nested.push(rendered)
      continue
    }
    if (isWhitespaceText(child)) continue
    content += tag === 'p' || tag === 'div' ? inlineChildren(child) : inlineMarkdown(child)
  }

  const lines = normalizedText(content).trim().split('\n')
  const first = `${marker} ${lines.shift() || ''}`.trimEnd()
  const continuation = lines.map((line) => `  ${line}`).join('\n')
  const nestedMarkdown = nested
    .map((value) => value.split('\n').map((line) => `  ${line}`).join('\n'))
    .join('\n')
  return [first, continuation, nestedMarkdown].filter(Boolean).join('\n')
}

const listMarkdown = (node) => {
  const ordered = elementTag(node) === 'ol'
  const parsedStart = Number.parseInt(node.getAttribute?.('start') || '1', 10)
  const start = Number.isFinite(parsedStart) ? parsedStart : 1
  return Array.from(node.children)
    .filter((child) => elementTag(child) === 'li')
    .map((item, index) => listItemMarkdown(item, ordered ? `${start + index}.` : '-'))
    .join('\n')
}

const blockquoteMarkdown = (node) => {
  const content = renderBlocks(node).trim()
  if (!content) return '>'
  return content
    .split('\n')
    .map((line) => line ? `> ${line}` : '>')
    .join('\n')
}

const codeFence = (value) => {
  const longest = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length))
  return '`'.repeat(Math.max(3, longest + 1))
}

const preMarkdown = (node) => {
  const code = Array.from(node.children).find((child) => elementTag(child) === 'code')
    || node.querySelector('code')
  const value = normalizedText(code?.textContent ?? node.textContent).replace(/\n+$/, '')
  const language = Array.from(code?.classList || [])
    .find((name) => name.startsWith('language-'))
    ?.slice('language-'.length) || ''
  const fence = codeFence(value)
  return `${fence}${language}\n${value}\n${fence}`
}

const tableCellMarkdown = (cell) => inlineChildren(cell)
  .trim()
  .replace(/\s*\n\s*/g, ' ')
  .replace(/\\/g, '\\\\')
  .replace(/\|/g, '\\|')

const tableMarkdown = (node) => {
  const rows = Array.from(node.querySelectorAll('tr'))
    .map((row) => Array.from(row.children)
      .filter((cell) => ['th', 'td'].includes(elementTag(cell)))
      .map(tableCellMarkdown))
    .filter((row) => row.length)
  if (!rows.length) return ''

  const width = Math.max(...rows.map((row) => row.length))
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array(Math.max(0, width - row.length)).fill('')
  ])
  const serializeRow = (row) => `| ${row.join(' | ')} |`
  return [
    serializeRow(normalizedRows[0]),
    serializeRow(Array(width).fill('---')),
    ...normalizedRows.slice(1).map(serializeRow)
  ].join('\n')
}

const blockMarkdown = (node) => {
  if (node.nodeType === TEXT_NODE) return isWhitespaceText(node) ? '' : normalizedText(node.data)
  if (node.nodeType !== ELEMENT_NODE) return ''

  switch (elementTag(node)) {
    case 'p':
    case 'div':
      return renderBlocks(node)
    case 'ul':
    case 'ol':
      return listMarkdown(node)
    case 'blockquote':
      return blockquoteMarkdown(node)
    case 'pre':
      return preMarkdown(node)
    case 'table':
      return tableMarkdown(node)
    default:
      return inlineMarkdown(node)
  }
}

const renderBlocks = (container) => {
  const blocks = []
  let inline = ''
  const flushInline = () => {
    if (inline.trim()) blocks.push(inline)
    inline = ''
  }

  for (const child of container.childNodes) {
    const tag = elementTag(child)
    if (BLOCK_TAGS.has(tag)) {
      flushInline()
      const rendered = blockMarkdown(child)
      if (rendered) blocks.push(rendered)
    } else if (!isWhitespaceText(child)) {
      inline += inlineMarkdown(child)
    }
  }
  flushInline()
  return blocks.join('\n\n')
}

export const htmlToMarkdown = (ownerDocument, html) => {
  if (!html) return ''
  const template = ownerDocument.createElement('template')
  template.innerHTML = html
  return renderBlocks(template.content)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

export const markdownFromClipboard = (event, ownerDocument) => {
  const clipboard = event?.clipboardData
  if (!clipboard?.getData) return null
  const plain = clipboard.getData('text/plain') || ''
  const html = clipboard.getData('text/html') || ''
  const markdown = htmlToMarkdown(ownerDocument, html)
  return normalizedText(markdown || plain)
}

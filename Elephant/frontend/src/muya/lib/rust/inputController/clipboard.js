const escapeLinkDestination = (value) => String(value || '').replace(/[()\\]/g, '\\$&')

const inlineMarkdown = (node) => {
  if (node.nodeType === node.TEXT_NODE) return node.data || ''
  if (node.nodeType !== node.ELEMENT_NODE) return ''

  const tag = node.tagName.toLowerCase()
  const content = Array.from(node.childNodes).map(inlineMarkdown).join('')
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
    case 'p':
    case 'div':
      return `${content}\n\n`
    default:
      return content
  }
}

export const htmlToMarkdown = (ownerDocument, html) => {
  if (!html) return ''
  const template = ownerDocument.createElement('template')
  template.innerHTML = html
  return Array.from(template.content.childNodes)
    .map(inlineMarkdown)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n$/, '')
}

export const markdownFromClipboard = (event, ownerDocument) => {
  const clipboard = event?.clipboardData
  if (!clipboard?.getData) return null
  const plain = clipboard.getData('text/plain') || ''
  const html = clipboard.getData('text/html') || ''
  const markdown = htmlToMarkdown(ownerDocument, html)
  return (markdown || plain).replace(/\r\n?/g, '\n')
}

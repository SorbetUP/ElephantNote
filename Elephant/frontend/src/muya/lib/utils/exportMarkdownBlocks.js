export const insertLineBreak = (result, indent) => {
  if (!result.length) return
  result.push(`${indent}\n`)
}

export const translateBlocks2Markdown = (exporter, blocks, indent = '', listIndent = '') => {
  const result = []
  let lastListBullet = ''

  for (const block of blocks) {
    if (block.type !== 'ul' && block.type !== 'ol') lastListBullet = ''
    switch (block.type) {
      case 'p':
      case 'hr':
        exporter.insertLineBreak(result, indent)
        result.push(exporter.translateBlocks2Markdown(block.children, indent))
        break
      case 'span':
        result.push(exporter.normalizeParagraphText(block, indent))
        break
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        exporter.insertLineBreak(result, indent)
        result.push(exporter.normalizeHeaderText(block, indent))
        break
      case 'figure':
        exporter.insertLineBreak(result, indent)
        if (block.functionType === 'table') {
          result.push(exporter.normalizeTable(block.children[0], indent))
        } else if (block.functionType === 'html') {
          result.push(exporter.normalizeHTML(block, indent))
        } else if (block.functionType === 'footnote') {
          result.push(exporter.normalizeFootnote(block, indent))
        } else if (block.functionType === 'multiplemath') {
          result.push(exporter.normalizeMultipleMath(block, indent))
        } else if (/mermaid|flowchart|sequence|plantuml|vega-lite/.test(block.functionType)) {
          result.push(exporter.normalizeContainer(block, indent))
        }
        break
      case 'li': {
        const insertNewLine = block.isLooseListItem
        exporter.isLooseParentList = insertNewLine
        if (insertNewLine) exporter.insertLineBreak(result, indent)
        result.push(exporter.normalizeListItem(block, indent + listIndent))
        exporter.isLooseParentList = true
        break
      }
      case 'ul':
      case 'ol': {
        let insertNewLine = exporter.isLooseParentList
        exporter.isLooseParentList = true
        const { bulletMarkerOrDelimiter } = block.children[0]
        if (lastListBullet && lastListBullet !== bulletMarkerOrDelimiter) {
          insertNewLine = false
        }
        lastListBullet = bulletMarkerOrDelimiter
        if (insertNewLine) exporter.insertLineBreak(result, indent)
        const listCount = block.start !== undefined ? block.start : 1
        exporter.listType.push(
          block.type === 'ul' ? { type: 'ul' } : { type: 'ol', listCount }
        )
        result.push(exporter.normalizeList(block, indent, listIndent))
        exporter.listType.pop()
        break
      }
      case 'pre':
        exporter.insertLineBreak(result, indent)
        result.push(
          block.functionType === 'frontmatter'
            ? exporter.normalizeFrontMatter(block, indent)
            : exporter.normalizeCodeBlock(block, indent)
        )
        break
      case 'blockquote':
        exporter.insertLineBreak(result, indent)
        result.push(exporter.normalizeBlockquote(block, indent))
        break
      default:
        console.warn('translateBlocks2Markdown: Unknown block type:', block.type)
        break
    }
  }
  return result.join('')
}

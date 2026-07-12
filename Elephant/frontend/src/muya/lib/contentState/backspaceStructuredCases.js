const handled = value => ({ handled: true, value })
const next = context => ({ handled: false, context })

const tableHasContent = table => {
  const tHead = table.children[0]
  const tBody = table.children[1]
  const tHeadHasContent = tHead.children[0].children.some(th =>
    th.children[0].text.trim()
  )
  const tBodyHasContent = tBody.children.some(row =>
    row.children.some(td => td.children[0].text.trim())
  )
  return tHeadHasContent || tBodyHasContent
}

export default function handleBackspaceStructured(contentState, event, context) {
  let { block, parent } = context
  const { left, preBlock } = context
  if (
    block.type === 'span' &&
    block.functionType === 'paragraphContent' &&
    left === 0 &&
    preBlock &&
    preBlock.functionType === 'footnoteInput'
  ) {
    event.preventDefault()
    event.stopPropagation()
    if (!parent.nextSibling) {
      const paragraph = contentState.createBlockP(block.text)
      const figure = contentState.closest(block, 'figure')
      contentState.insertBefore(paragraph, figure)
      contentState.removeBlock(figure)
      const key = paragraph.children[0].key
      const offset = 0
      contentState.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      contentState.partialRender()
    }
    return handled(undefined)
  }

  if (
    block.type === 'span' &&
    block.functionType === 'codeContent' &&
    left === 0 &&
    !block.preSibling
  ) {
    event.preventDefault()
    event.stopPropagation()
    if (!block.nextSibling) {
      const pre = contentState.getParent(parent)
      const paragraph = contentState.createBlock('p')
      const line = contentState.createBlock('span', { text: block.text })
      const key = line.key
      const offset = 0
      contentState.appendChild(paragraph, line)
      let referenceBlock = null
      switch (pre.functionType) {
        case 'fencecode':
        case 'indentcode':
        case 'frontmatter':
          referenceBlock = pre
          break
        case 'multiplemath':
        case 'flowchart':
        case 'mermaid':
        case 'sequence':
        case 'plantuml':
        case 'vega-lite':
        case 'html':
          referenceBlock = contentState.getParent(pre)
          break
      }
      contentState.insertBefore(paragraph, referenceBlock)
      contentState.removeBlock(referenceBlock)
      contentState.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      contentState.partialRender()
    }
    return handled(undefined)
  }

  if (left === 0 && block.functionType === 'cellContent') {
    event.preventDefault()
    event.stopPropagation()
    const table = contentState.closest(block, 'table')
    const figure = contentState.closest(table, 'figure')
    const hasContent = tableHasContent(table)
    let key
    let offset
    if ((!preBlock || preBlock.functionType !== 'cellContent') && !hasContent) {
      const paragraphContent = contentState.createBlock('span')
      delete figure.functionType
      figure.children = []
      contentState.appendChild(figure, paragraphContent)
      figure.text = ''
      figure.type = 'p'
      key = paragraphContent.key
      offset = 0
    } else if (preBlock) {
      key = preBlock.key
      offset = preBlock.text.length
    }
    if (key !== undefined && offset !== undefined) {
      contentState.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      contentState.partialRender()
    }
    return handled(undefined)
  }
  return next({ ...context, block, parent })
}

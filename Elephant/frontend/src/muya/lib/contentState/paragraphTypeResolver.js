const resolveSpanType = (contentState, block) => {
  let internalType = ''
  if (block.functionType === 'atxLine') {
    internalType = 'heading 1'
  } else if (block.functionType === 'languageInput') {
    internalType = 'pre'
  } else if (block.functionType === 'codeContent') {
    if (block.lang === 'markup') internalType = 'html'
    else if (block.lang === 'latex') internalType = 'mathblock'
    const rootBlock = contentState.getAnchor(block)
    internalType = rootBlock && rootBlock.functionType !== 'fencecode'
      ? rootBlock.functionType
      : 'pre'
  } else if (block.functionType === 'cellContent') {
    internalType = 'table'
  } else if (block.functionType === 'thematicBreakLine') {
    internalType = 'hr'
  }

  const { affiliation } = contentState.selectionChange(contentState.cursor)
  const listTypes = affiliation
    .slice(0, 3)
    .filter(item => /ul|ol/.test(item.type))
    .map(item => item.listType)
  if (listTypes && listTypes.length === 1) {
    const listType = listTypes[0]
    if (listType === 'bullet') internalType = 'ul-bullet'
    else if (listType === 'task') internalType = 'ul-task'
    if (listType === 'order') internalType = 'ol-order'
  } else if (
    affiliation.length === 2 &&
    affiliation[1].type === 'blockquote'
  ) {
    internalType = 'blockquote'
  } else if (block.functionType === 'paragraphContent') {
    internalType = 'paragraph'
  }
  return internalType
}

export function getTypeFromBlock(block) {
  const { type } = block
  const headingMatch = type.match(/^h([1-6]{1})$/)
  let internalType = headingMatch && headingMatch[1]
    ? `heading ${headingMatch[1]}`
    : ''

  switch (type) {
    case 'span':
      internalType = resolveSpanType(this, block)
      break
    case 'div':
      return ''
    case 'figure':
      internalType = block.functionType === 'multiplemath'
        ? 'mathblock'
        : block.functionType
      break
    case 'pre':
      if (block.functionType === 'multiplemath') internalType = 'mathblock'
      else if (/fencecode|indentcode/.test(block.functionType)) internalType = 'pre'
      else if (block.functionType === 'frontmatter') internalType = 'front-matter'
      else internalType = block.functionType
      break
    case 'ul':
      internalType = block.listType === 'task' ? 'ul-task' : 'ul-bullet'
      break
    case 'ol':
      internalType = 'ol-order'
      break
    case 'li':
      if (block.listItemType === 'order') internalType = 'ol-order'
      else if (block.listItemType === 'bullet') internalType = 'ul-bullet'
      else if (block.listItemType === 'task') internalType = 'ul-task'
      break
    case 'table':
    case 'th':
    case 'td':
      internalType = 'table'
      break
  }
  return internalType
}

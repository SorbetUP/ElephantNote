const paragraphTypes = ContentState => {
  ContentState.prototype.isAllowedTransformation = function(
    block,
    toType,
    isMultilineSelection
  ) {
    const fromType = this.getTypeFromBlock(block)
    if (toType === 'front-matter') return true
    if (!fromType) return false
    if (isMultilineSelection && /heading|table/.test(toType)) return false
    if (fromType === toType || toType === 'reset-to-paragraph') return true

    switch (fromType) {
      case 'ul-bullet':
      case 'ul-task':
      case 'ol-order':
      case 'blockquote':
      case 'paragraph':
        if (/hr|table/.test(toType) && block.text) return false
        return true
      case 'heading 1':
      case 'heading 2':
      case 'heading 3':
      case 'heading 4':
      case 'heading 5':
      case 'heading 6':
        return /paragraph|heading/.test(toType)
      default:
        return false
    }
  }

  ContentState.prototype.getTypeFromBlock = function(block) {
    const { type } = block
    let internalType = ''
    const headingMatch = type.match(/^h([1-6]{1})$/)
    if (headingMatch && headingMatch[1]) {
      internalType = `heading ${headingMatch[1]}`
    }

    switch (type) {
      case 'span': {
        if (block.functionType === 'atxLine') {
          internalType = 'heading 1'
        } else if (block.functionType === 'languageInput') {
          internalType = 'pre'
        } else if (block.functionType === 'codeContent') {
          if (block.lang === 'markup') {
            internalType = 'html'
          } else if (block.lang === 'latex') {
            internalType = 'mathblock'
          }
          const rootBlock = this.getAnchor(block)
          if (rootBlock && rootBlock.functionType !== 'fencecode') {
            internalType = rootBlock.functionType
          } else {
            internalType = 'pre'
          }
        } else if (block.functionType === 'cellContent') {
          internalType = 'table'
        } else if (block.functionType === 'thematicBreakLine') {
          internalType = 'hr'
        }

        const { affiliation } = this.selectionChange(this.cursor)
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
        break
      }
      case 'div':
        return ''
      case 'figure':
        internalType = block.functionType === 'multiplemath'
          ? 'mathblock'
          : block.functionType
        break
      case 'pre':
        if (block.functionType === 'multiplemath') {
          internalType = 'mathblock'
        } else if (
          block.functionType === 'fencecode' ||
          block.functionType === 'indentcode'
        ) {
          internalType = 'pre'
        } else if (block.functionType === 'frontmatter') {
          internalType = 'front-matter'
        } else {
          internalType = block.functionType
        }
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
}

export default paragraphTypes

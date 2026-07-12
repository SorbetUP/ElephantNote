export default function importMarkdownStructureToken(state, token) {
  const contentState = state.contentState
  let block
  switch (token.type) {
    case 'blockquote_start':
      block = contentState.createBlock('blockquote')
      contentState.appendChild(state.parentList[0], block)
      state.parentList.unshift(block)
      return true
    case 'blockquote_end':
      if (state.parentList[0].children.length === 0) {
        contentState.appendChild(
          state.parentList[0],
          contentState.createBlockP()
        )
      }
      state.parentList.shift()
      return true
    case 'footnote_start': {
      block = contentState.createBlock('figure', {
        functionType: 'footnote'
      })
      const identifierInput = contentState.createBlock('span', {
        text: token.identifier,
        functionType: 'footnoteInput'
      })
      contentState.appendChild(block, identifierInput)
      contentState.appendChild(state.parentList[0], block)
      state.parentList.unshift(block)
      return true
    }
    case 'footnote_end':
      state.parentList.shift()
      return true
    case 'list_start': {
      const { ordered, listType, start } = token
      block = contentState.createBlock(ordered === true ? 'ol' : 'ul')
      block.listType = listType
      if (listType === 'order') {
        block.start = /^\d+$/.test(start) ? start : 1
      }
      contentState.appendChild(state.parentList[0], block)
      state.parentList.unshift(block)
      return true
    }
    case 'list_end':
      state.parentList.shift()
      return true
    case 'loose_item_start':
    case 'list_item_start': {
      const { listItemType, bulletMarkerOrDelimiter, checked, type } = token
      block = contentState.createBlock('li', {
        listItemType: checked !== undefined ? 'task' : listItemType,
        bulletMarkerOrDelimiter,
        isLooseListItem: type === 'loose_item_start'
      })
      if (checked !== undefined) {
        contentState.appendChild(
          block,
          contentState.createBlock('input', { checked })
        )
      }
      contentState.appendChild(state.parentList[0], block)
      state.parentList.unshift(block)
      return true
    }
    case 'list_item_end':
      state.parentList.shift()
      return true
    case 'space':
      return true
    default:
      return false
  }
}

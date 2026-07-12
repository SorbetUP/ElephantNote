import selection from '../selection'

const paragraphInListItem = block => {
  return block.listItemType === 'task' ? block.children[1] : block.children[0]
}

const splitMiddle = (contentState, block, paragraph, type, start) => {
  let { pre, post } = selection.chopHtmlByCursor(paragraph)
  let newBlock
  if (/^h\d$/.test(block.type)) {
    if (block.headingStyle === 'atx') {
      const prefix = /^#+/.exec(pre)[0]
      post = `${prefix} ${post}`
    }
    block.children[0].text = pre
    newBlock = contentState.createBlock(type, {
      headingStyle: block.headingStyle
    })
    const headerContent = contentState.createBlock('span', {
      text: post,
      functionType: block.headingStyle === 'atx'
        ? 'atxLine'
        : 'paragraphContent'
    })
    contentState.appendChild(newBlock, headerContent)
    if (block.marker) newBlock.marker = block.marker
  } else if (block.type === 'p') {
    newBlock = contentState.chopBlockByCursor(
      block,
      start.key,
      start.offset
    )
  } else if (type === 'li') {
    if (block.listItemType === 'task') {
      const { checked } = block.children[0]
      newBlock = contentState.chopBlockByCursor(
        block.children[1],
        start.key,
        start.offset
      )
      newBlock = contentState.createTaskItemBlock(newBlock, checked)
    } else {
      newBlock = contentState.chopBlockByCursor(
        block.children[0],
        start.key,
        start.offset
      )
      newBlock = contentState.createBlockLi(newBlock)
      newBlock.listItemType = block.listItemType
      newBlock.bulletMarkerOrDelimiter = block.bulletMarkerOrDelimiter
      if (block.children.length > 1) {
        contentState.appendChild(newBlock, block.children[1])
        contentState.removeBlock(block.children[1])
      }
    }
    newBlock.isLooseListItem = block.isLooseListItem
  } else if (block.type === 'hr') {
    const preText = block.children[0].text.substring(0, start.offset)
    const postText = block.children[0].text.substring(start.offset)
    if (preText.replace(/ /g, '').length < 3) {
      block.type = 'p'
      block.children[0].functionType = 'paragraphContent'
    }
    if (postText.replace(/ /g, '').length >= 3) {
      newBlock = contentState.createBlock('hr')
      const content = contentState.createBlock('span', {
        functionType: 'thematicBreakLine',
        text: postText
      })
      contentState.appendChild(newBlock, content)
    } else {
      newBlock = contentState.createBlockP(postText)
    }
    block.children[0].text = preText
  }
  contentState.insertAfter(newBlock, block)
  return newBlock
}

const splitBoundary = (contentState, block, type, left, right) => {
  let newBlock
  if (type === 'li') {
    if (block.listItemType === 'task') {
      newBlock = contentState.createTaskItemBlock(null, false)
    } else {
      newBlock = contentState.createBlockLi()
      newBlock.listItemType = block.listItemType
      newBlock.bulletMarkerOrDelimiter = block.bulletMarkerOrDelimiter
    }
    newBlock.isLooseListItem = block.isLooseListItem
  } else {
    newBlock = contentState.createBlockP()
  }

  if (left === 0 && right !== 0) {
    contentState.insertBefore(newBlock, block)
    return block
  }
  if (block.type === 'p') {
    const lastLine = block.children[block.children.length - 1]
    if (lastLine.text === '') contentState.removeBlock(lastLine)
  } else if (block.type === 'li') {
    const nestedIndex = block.listItemType === 'task' ? 2 : 1
    if (block.children.length > nestedIndex) {
      contentState.appendChild(newBlock, block.children[nestedIndex])
      contentState.removeBlock(block.children[nestedIndex])
    }
  }
  contentState.insertAfter(newBlock, block)
  return newBlock
}

export default function splitEnterBlock(contentState, context, start) {
  const { block, paragraph, text } = context
  const left = start.offset
  const right = text.length - left
  const type = block.type
  let newBlock
  if (left !== 0 && right !== 0) {
    newBlock = splitMiddle(
      contentState,
      block,
      paragraph,
      type,
      start
    )
  } else if (left === 0 && right === 0) {
    return {
      handled: true,
      value: contentState.enterInEmptyParagraph(block)
    }
  } else if (
    (left !== 0 && right === 0) ||
    (left === 0 && right !== 0)
  ) {
    newBlock = splitBoundary(contentState, block, type, left, right)
  } else {
    newBlock = contentState.createBlockP()
    contentState.insertAfter(newBlock, block)
  }
  return {
    handled: false,
    context: { ...context, block, newBlock, getParagraphBlock: paragraphInListItem }
  }
}

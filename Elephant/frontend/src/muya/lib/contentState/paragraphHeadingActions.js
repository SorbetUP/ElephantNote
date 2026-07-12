import { DEFAULT_TURNDOWN_CONFIG } from '../config'

const getCurrentLevel = type => {
  return /\d/.test(type) ? Number(/\d/.exec(type)[0]) : 0
}

export const transformHeading = (
  contentState,
  paraType,
  block,
  start,
  end
) => {
  if (start.key !== end.key) return { stop: true }

  const { text, type } = block
  const headingStyle = DEFAULT_TURNDOWN_CONFIG.headingStyle
  const parent = contentState.getParent(block)
  const [, hash, partText] = /(^ {0,3}#*[ \u00A0]*)([\s\S]*)/.exec(text)
  let newLevel = 0
  let newType = 'p'
  let key

  if (/\d/.test(paraType)) {
    newLevel = Number(paraType.split(/\s/)[1])
    newType = `h${newLevel}`
  } else if (
    paraType === 'upgrade heading' ||
    paraType === 'degrade heading'
  ) {
    const currentLevel = getCurrentLevel(parent.type)
    newLevel = currentLevel
    if (paraType === 'upgrade heading' && currentLevel !== 1) {
      newLevel = currentLevel === 0 ? 6 : currentLevel - 1
    } else if (paraType === 'degrade heading' && currentLevel !== 0) {
      newLevel = currentLevel === 6 ? 0 : currentLevel + 1
    }
    newType = newLevel === 0 ? 'p' : `h${newLevel}`
  }

  const startOffset = newLevel > 0
    ? start.offset + newLevel - hash.length + 1
    : start.offset - hash.length
  const endOffset = newLevel > 0
    ? end.offset + newLevel - hash.length + 1
    : end.offset - hash.length
  let newText = newLevel > 0
    ? '#'.repeat(newLevel) + `${String.fromCharCode(160)}${partText}`
    : partText

  if (type === 'span' && block.functionType === 'thematicBreakLine') {
    newText = ''
  }
  if (newType === 'p' && parent.type === newType) return { stop: true }
  if (
    newType !== 'p' &&
    parent.type === newType &&
    parent.headingStyle === headingStyle
  ) {
    return { stop: true }
  }

  if (newType !== 'p') {
    const header = contentState.createBlock(newType, { headingStyle })
    const headerContent = contentState.createBlock('span', {
      text: headingStyle === 'atx' ? newText.replace(/\n/g, ' ') : newText,
      functionType: headingStyle === 'atx' ? 'atxLine' : 'paragraphContent'
    })
    contentState.appendChild(header, headerContent)
    key = headerContent.key
    contentState.insertBefore(header, parent)
    contentState.removeBlock(parent)
  } else {
    const paragraph = contentState.createBlockP(newText)
    key = paragraph.children[0].key
    contentState.insertAfter(paragraph, parent)
    contentState.removeBlock(parent)
  }

  contentState.cursor = {
    start: { key, offset: startOffset },
    end: { key, offset: endOffset },
    isEdit: true
  }
  return { stop: false }
}

export const insertHorizontalRule = (
  contentState,
  block,
  text
) => {
  const paragraph = contentState.createBlockP()
  const anchor = block.type === 'span' ? contentState.getParent(block) : block
  const horizontalRule = contentState.createBlock('hr')
  const thematicContent = contentState.createBlock('span', {
    functionType: 'thematicBreakLine',
    text: '---'
  })
  contentState.appendChild(horizontalRule, thematicContent)
  contentState.insertAfter(horizontalRule, anchor)
  contentState.insertAfter(paragraph, horizontalRule)
  if (!text) {
    if (block.type === 'span' && contentState.isOnlyChild(block)) {
      contentState.removeBlock(anchor)
    } else {
      contentState.removeBlock(block)
    }
  }

  const { key } = paragraph.children[0]
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
}

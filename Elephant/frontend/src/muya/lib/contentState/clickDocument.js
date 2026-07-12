import { isMuyaEditorElement } from '../selection/dom'

export const handleEditorBackgroundClick = (contentState, event) => {
  const { target } = event
  if (!isMuyaEditorElement(target)) return { handled: false }

  const lastBlock = contentState.getLastBlock()
  const archor = contentState.findOutMostBlock(lastBlock)
  const archorParagraph = document.querySelector(`#${archor.key}`)
  if (archorParagraph === null) return { handled: true, value: undefined }

  const rect = archorParagraph.getBoundingClientRect()
  if (event.clientY <= rect.top + rect.height) return { handled: false }

  let needToInsertNewParagraph = false
  if (lastBlock.type === 'span') {
    if (
      /atxLine|paragraphContent/.test(lastBlock.functionType) &&
      /\S/.test(lastBlock.text)
    ) {
      needToInsertNewParagraph = true
    }
    if (!/atxLine|paragraphContent/.test(lastBlock.functionType)) {
      needToInsertNewParagraph = true
    }
  } else {
    needToInsertNewParagraph = true
  }

  if (!needToInsertNewParagraph) return { handled: false }

  event.preventDefault()
  const paragraphBlock = contentState.createBlockP()
  contentState.insertAfter(paragraphBlock, archor)
  const key = paragraphBlock.children[0].key
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return { handled: true, value: contentState.render() }
}

export const handleFrontMenuClick = (contentState, event) => {
  const { eventCenter } = contentState.muya
  const { target } = event
  const { start: oldStart, end: oldEnd } = contentState.cursor
  if (!oldStart || !oldEnd) return { handled: false }

  let hasSameParent = false
  const startBlock = contentState.getBlock(oldStart.key)
  const endBlock = contentState.getBlock(oldEnd.key)
  if (startBlock && endBlock) {
    const startOutBlock = contentState.findOutMostBlock(startBlock)
    const endOutBlock = contentState.findOutMostBlock(endBlock)
    hasSameParent = startOutBlock === endOutBlock
  }

  if (target.closest('.ag-front-icon-button') && hasSameParent) {
    const currentBlock = contentState.findOutMostBlock(startBlock)
    const frontIcon = target.closest('.ag-front-icon-button')
    const rect = frontIcon.getBoundingClientRect()
    const reference = {
      getBoundingClientRect() {
        return rect
      },
      clientWidth: rect.width,
      clientHeight: rect.height,
      id: currentBlock.key
    }
    contentState.selectedBlock = currentBlock
    eventCenter.dispatch('muya-front-menu', {
      reference,
      outmostBlock: currentBlock,
      startBlock,
      endBlock
    })
    return { handled: true, value: contentState.partialRender() }
  }

  if (target.closest('.ag-copy-header-link') && hasSameParent) {
    const currentBlock = contentState.findOutMostBlock(startBlock)
    eventCenter.dispatch('heading-copy-link', {
      key: currentBlock.key
    })
  }
  return { handled: false }
}

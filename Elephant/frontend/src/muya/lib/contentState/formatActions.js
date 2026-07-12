import selection from '../selection'
import { generator } from '../parser/'
import { getImageInfo } from '../utils/getImageInfo'
import { addFormat, clearFormat } from './formatHelpers'

const showEmptyImageSelector = contentState => {
  requestAnimationFrame(() => {
    const startNode = selection.getSelectionStart()
    if (!startNode) return
    const imageWrapper = startNode.closest('.ag-inline-image')
    if (imageWrapper && imageWrapper.classList.contains('ag-empty-image')) {
      const imageInfo = getImageInfo(imageWrapper)
      contentState.muya.eventCenter.dispatch('muya-image-selector', {
        reference: imageWrapper,
        imageInfo,
        cb: () => {}
      })
    }
  })
}

const formatSingleBlock = (contentState, type, startBlock, start, end) => {
  const { formats, tokens, neighbors } = contentState.selectionFormats()
  const matchesType = format => {
    return format.type === type || (format.type === 'html_tag' && format.tag === type)
  }
  const currentFormats = formats.filter(matchesType).reverse()
  const currentNeighbors = neighbors.filter(matchesType).reverse()

  if (type === 'clear') {
    for (const neighbor of neighbors) clearFormat(neighbor, { start, end })
    start.offset += start.delata
    end.offset += end.delata
    startBlock.text = generator(tokens)
  } else if (currentFormats.length) {
    for (const token of currentFormats) clearFormat(token, { start, end })
    start.offset += start.delata
    end.offset += end.delata
    startBlock.text = generator(tokens)
  } else {
    for (const neighbor of currentNeighbors) clearFormat(neighbor, { start, end })
    start.offset += start.delata
    end.offset += end.delata
    startBlock.text = generator(tokens)
    addFormat(type, startBlock, { start, end })
    if (type === 'image') showEmptyImageSelector(contentState)
  }

  contentState.cursor = { start, end, isEdit: true }
  contentState.partialRender()
}

const formatMultipleBlocks = (contentState, type, startBlock, endBlock, start, end) => {
  let nextBlock = startBlock
  const formatType = type !== 'clear' ? type : undefined
  while (nextBlock && nextBlock !== endBlock) {
    contentState.clearBlockFormat(nextBlock, { start, end }, formatType)
    nextBlock = contentState.findNextBlockInLocation(nextBlock)
  }
  contentState.clearBlockFormat(endBlock, { start, end }, formatType)

  if (type !== 'clear') {
    addFormat(type, startBlock, {
      start,
      end: { offset: startBlock.text.length }
    })
    nextBlock = contentState.findNextBlockInLocation(startBlock)
    while (nextBlock && nextBlock !== endBlock) {
      addFormat(type, nextBlock, {
        start: { offset: 0 },
        end: { offset: nextBlock.text.length }
      })
      nextBlock = contentState.findNextBlockInLocation(nextBlock)
    }
    addFormat(type, endBlock, { start: { offset: 0 }, end })
  }

  contentState.cursor = { start, end, isEdit: true }
  contentState.partialRender()
}

const formatActions = ContentState => {
  ContentState.prototype.format = function(type) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) return

    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    start.delata = end.delata = 0
    if (start.key === end.key) {
      return formatSingleBlock(this, type, startBlock, start, end)
    }
    return formatMultipleBlocks(this, type, startBlock, endBlock, start, end)
  }
}

export default formatActions

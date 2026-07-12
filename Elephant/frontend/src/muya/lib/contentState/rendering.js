import selection from '../selection'

const markActiveMatches = (matches, index) => {
  matches.forEach((match, matchIndex) => {
    match.active = matchIndex === index
  })
}

export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    setCursor() {
      selection.setCursorRange(this.cursor)
    },

    setNextRenderRange() {
      const { start, end } = this.cursor
      const startBlock = this.getBlock(start ? start.key : null)
      const endBlock = this.getBlock(end ? end.key : null)
      if (!startBlock || !endBlock) {
        this.renderRange = [null, null]
        return
      }
      const startOutMostBlock = this.findOutMostBlock(startBlock)
      const endOutMostBlock = this.findOutMostBlock(endBlock)
      this.renderRange = [startOutMostBlock.preSibling, endOutMostBlock.nextSibling]
    },

    postRender() {
      this.resizeLineNumber()
    },

    render(isRenderCursor = true, clearCache = false) {
      const { blocks, searchMatches: { matches, index } } = this
      const activeBlocks = this.getActiveBlocks()
      if (clearCache) this.stateRender.tokenCache.clear()
      markActiveMatches(matches, index)
      this.setNextRenderRange()
      this.stateRender.collectLabels(blocks)
      this.stateRender.render(blocks, activeBlocks, matches)
      if (isRenderCursor) this.setCursor()
      else this.muya.blur()
      this.postRender()
    },

    partialRender(isRenderCursor = true) {
      const { blocks, searchMatches: { matches, index } } = this
      const activeBlocks = this.getActiveBlocks()
      const [startKey, endKey] = this.renderRange
      markActiveMatches(matches, index)

      let startIndex = startKey ? blocks.findIndex((block) => block.key === startKey) : 0
      if (startIndex === -1) startIndex = 0

      let endIndex = blocks.length
      if (endKey) {
        const tmpEndIndex = blocks.findIndex((block) => block.key === endKey)
        if (tmpEndIndex >= 0) endIndex = tmpEndIndex + 1
      }

      const blocksToRender = blocks.slice(startIndex, endIndex)
      this.setNextRenderRange()
      this.stateRender.collectLabels(blocks)
      this.stateRender.partialRender(blocksToRender, activeBlocks, matches, startKey, endKey)
      if (isRenderCursor) this.setCursor()
      else this.muya.blur()
      this.postRender()
    },

    singleRender(block, isRenderCursor = true) {
      const { blocks, searchMatches: { matches, index } } = this
      const activeBlocks = this.getActiveBlocks()
      markActiveMatches(matches, index)
      this.setNextRenderRange()
      this.stateRender.collectLabels(blocks)
      this.stateRender.singleRender(block, activeBlocks, matches)
      if (isRenderCursor) this.setCursor()
      else this.muya.blur()
      this.postRender()
    }
  })
}

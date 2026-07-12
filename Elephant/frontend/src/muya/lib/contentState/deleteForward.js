import selection from '../selection'
import { removeMergedBlocks } from './deleteListMerge'

export function deleteHandler(event) {
  const { start, end } = selection.getCursorRange()
  if (!start || !end) return
  const startBlock = this.getBlock(start.key)
  const nextBlock = this.findNextBlockInLocation(startBlock)
  if (startBlock.type === 'figure') event.preventDefault()
  if (start.key !== end.key || start.offset !== end.offset) return

  const { type, text, key } = startBlock
  if (/span/.test(type) && start.offset === 0 && text[1] === '\n') {
    event.preventDefault()
    startBlock.text = text.substring(2)
    this.cursor = {
      start: { key, offset: 0 },
      end: { key, offset: 0 },
      isEdit: true
    }
    return this.singleRender(startBlock)
  }
  if (!/h\d|span/.test(type) || start.offset !== text.length) return

  event.preventDefault()
  if (!nextBlock || !/h\d|span/.test(nextBlock.type)) return
  if (
    nextBlock.functionType === 'codeContent' &&
    startBlock.functionType === 'languageInput'
  ) {
    return
  }

  startBlock.text += nextBlock.text
  const toBeRemoved = [nextBlock]
  let parent = this.getParent(nextBlock)
  let target = nextBlock
  while (this.isOnlyRemoveableChild(target)) {
    toBeRemoved.push(parent)
    target = parent
    parent = this.getParent(parent)
  }
  removeMergedBlocks(this, toBeRemoved)
  const offset = start.offset
  this.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  this.render()
}

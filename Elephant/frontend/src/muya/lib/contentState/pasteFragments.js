import { insertFragments } from './pasteFragmentInsertion'
import { getLastBlock } from './pasteFragmentTree'

export default function pasteFragments(contentState, stateFragments, start, end, startBlock, endBlock, parent) {
  const cacheText = endBlock.text.substring(end.offset)
  startBlock.text = startBlock.text.substring(0, start.offset)
  const pasteType = contentState.checkPasteType(startBlock, stateFragments[0])
  const lastBlock = getLastBlock(stateFragments)
  let key = lastBlock.key
  let offset = lastBlock.text.length
  lastBlock.text += cacheText

  insertFragments(contentState, pasteType, stateFragments, startBlock, parent)

  let cursorBlock = contentState.getBlock(key)
  if (!cursorBlock) {
    key = startBlock.key
    offset = startBlock.text.length - cacheText.length
    cursorBlock = startBlock
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.checkInlineUpdate(cursorBlock)
  contentState.partialRender()
  contentState.muya.dispatchSelectionChange()
  contentState.muya.dispatchSelectionFormats()
  return contentState.muya.dispatchChange()
}

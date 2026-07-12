import { convertExistingList } from './listConversion'
import { wrapSelectedBlocks } from './listWrapping'

export function handleListMenu(paraType, insertMode) {
  const { start, end, affiliation } = this.selectionChange(this.cursor)
  const [blockType, listType] = paraType.split('-')
  const isListed = affiliation
    .slice(0, 3)
    .filter(block => /ul|ol/.test(block.type))

  if (isListed.length && !insertMode) {
    if (convertExistingList(this, isListed[0], blockType, listType)) return
  } else if (
    start.key === end.key ||
    (start.block.parent && start.block.parent === end.block.parent)
  ) {
    const block = this.getBlock(start.key)
    const paragraph = this.getBlock(block.parent)
    if (listType === 'task') {
      const listItemParagraph = this.updateList(
        paragraph,
        'bullet',
        undefined,
        block
      )
      setTimeout(() => {
        this.updateTaskListItem(listItemParagraph, listType)
        this.partialRender()
        this.muya.dispatchSelectionChange()
        this.muya.dispatchSelectionFormats()
        this.muya.dispatchChange()
      })
      return false
    }
    this.updateList(paragraph, listType, undefined, block)
  } else {
    const { parent, startIndex, endIndex } = this.getCommonParent()
    wrapSelectedBlocks(this, listType, parent, startIndex, endIndex)
  }
  return true
}

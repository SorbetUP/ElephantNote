import { LIST_REG } from './pasteChecks'
import { mergeListFragment } from './pasteFragmentLists'
import { mergeTextFragment } from './pasteFragmentText'

export const insertFragments = (contentState, pasteType, stateFragments, startBlock, parent) => {
  const firstFragment = stateFragments[0]
  const tailFragments = stateFragments.slice(1)
  if (pasteType === 'MERGE') {
    if (LIST_REG.test(firstFragment.type)) {
      mergeListFragment(contentState, firstFragment, tailFragments, startBlock, parent)
    } else if (firstFragment.type === 'p' || /^h\d/.test(firstFragment.type)) {
      mergeTextFragment(contentState, firstFragment, tailFragments, startBlock, parent)
    }
    return
  }
  if (pasteType === 'NEWLINE') {
    let target = parent
    stateFragments.forEach(block => {
      contentState.insertAfter(block, target)
      target = block
    })
    if (startBlock.text.length === 0) contentState.removeBlock(parent)
    return
  }
  throw new Error('unknown paste type')
}

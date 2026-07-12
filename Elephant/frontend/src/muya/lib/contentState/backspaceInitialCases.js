import { handleAtxBackspace } from './backspaceAtxCase'
import { handleCellContentBackspace } from './backspaceCellCase'
import { handleCodeContentBackspace } from './backspaceCodeCase'
import { handleInlineTokenBackspace } from './backspaceInlineTokenCase'
import { next, handled } from './backspaceResults'
import {
  handleSelectedImageBackspace,
  handleSelectAllBackspace
} from './backspaceSelectionCases'
import { handleTableHeaderBackspace } from './backspaceTableHeaderCase'

export default function handleBackspaceInitial(contentState, event, start, end) {
  const selectedImage = handleSelectedImageBackspace(contentState, event)
  if (selectedImage) return selectedImage
  const selectAll = handleSelectAllBackspace(contentState, event)
  if (selectAll) return selectAll

  const startBlock = contentState.getBlock(start.key)
  const endBlock = contentState.getBlock(end.key)
  const maybeLastRow = contentState.getParent(endBlock)
  const startOutmostBlock = contentState.findOutMostBlock(startBlock)
  const endOutmostBlock = contentState.findOutMostBlock(endBlock)

  const atx = handleAtxBackspace(contentState, event, start, end, startBlock)
  if (atx) return atx
  const inline = handleInlineTokenBackspace(contentState, event, start, end, startBlock)
  if (inline) return inline
  const table = handleTableHeaderBackspace(
    contentState, event, start, end, startBlock, endBlock,
    startOutmostBlock, endOutmostBlock, maybeLastRow
  )
  if (table) return table
  const cell = handleCellContentBackspace(contentState, event, startBlock)
  if (cell) return cell
  const code = handleCodeContentBackspace(contentState, event, startBlock, endBlock)
  if (code) return code

  if (start.key !== end.key || start.offset !== end.offset) return handled(undefined)
  return next({ startBlock })
}

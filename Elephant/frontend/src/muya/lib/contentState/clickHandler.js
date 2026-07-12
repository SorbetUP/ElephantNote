import selection from '../selection'
import { handleEditorBackgroundClick, handleFrontMenuClick } from './clickDocument'
import { dispatchClickedFormats, showSelectionFormatPicker } from './clickFormats'
import { updateClickCursorState } from './clickStateUpdate'

export function clickHandler(event) {
  const backgroundClick = handleEditorBackgroundClick(this, event)
  if (backgroundClick.handled) return backgroundClick.value

  const frontMenuClick = handleFrontMenuClick(this, event)
  if (frontMenuClick.handled) return frontMenuClick.value

  const { start, end } = selection.getCursorRange()
  if (!start || !end) return

  const node = selection.getSelectionStart()
  dispatchClickedFormats(this, event, node)

  const block = this.getBlock(start.key)
  showSelectionFormatPicker(this, start, end, block)
  return updateClickCursorState(this, start, end, block)
}

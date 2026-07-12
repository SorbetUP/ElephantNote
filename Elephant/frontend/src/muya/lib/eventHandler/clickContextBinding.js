import selection from '../selection'

export default function bindContextClick(muya) {
  const { container, eventCenter, contentState } = muya
  const handler = event => {
    if (!global || !global.marktext) {
      event.preventDefault()
      event.stopPropagation()
    }

    const { keyboard } = muya
    if (keyboard) keyboard.hideAllFloatTools()

    const { start, end } = selection.getCursorRange()
    if (!start || !end) return

    const startBlock = contentState.getBlock(start.key)
    const nextTextBlock = contentState.findNextBlockInLocation(startBlock)
    if (
      nextTextBlock &&
      nextTextBlock.key === end.key &&
      end.offset === 0 &&
      start.offset === startBlock.text.length
    ) {
      contentState.cursor = { start, end: start }
      selection.setCursorRange(contentState.cursor)
    } else {
      contentState.cursor = { start, end }
    }

    const sectionChanges = contentState.selectionChange(contentState.cursor)
    eventCenter.dispatch('contextmenu', event, sectionChanges)
  }
  eventCenter.attachDOMEvent(container, 'contextmenu', handler)
}

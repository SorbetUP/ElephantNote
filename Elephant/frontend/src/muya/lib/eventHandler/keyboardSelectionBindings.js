import { EVENT_KEYS, KEYS_TO_IGNORE } from '../config'
import selection from '../selection'
import { findNearestParagraph } from '../selection/dom'
import { getParagraphReference } from '../utils'
import { checkEditEmoji } from '../ui/emojis'

export const bindEditorStateDispatch = keyboard => {
  const { container, eventCenter } = keyboard.muya
  let timer = null
  const changeHandler = event => {
    if (
      event.type === 'keyup' &&
      (event.key === EVENT_KEYS.ArrowUp || event.key === EVENT_KEYS.ArrowDown) &&
      Object.keys(keyboard.shownFloat).length > 0
    ) {
      return
    }
    if (event.target.closest('[contenteditable=false]')) return
    if (event.key in KEYS_TO_IGNORE) return

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const cursor = selection.getCursorRange()
      if (!cursor.start || !cursor.end) return
      keyboard.muya.dispatchSelectionChange(cursor)
      keyboard.muya.dispatchSelectionFormats(cursor)
      if (!keyboard.isComposed && event.type === 'click') {
        keyboard.muya.dispatchChange()
      }
    })
  }

  eventCenter.attachDOMEvent(container, 'click', changeHandler)
  eventCenter.attachDOMEvent(container, 'keyup', changeHandler)
}

export const bindKeyboardKeyup = keyboard => {
  const { container, eventCenter, contentState } = keyboard.muya
  const handler = event => {
    container.classList.remove('ag-meta-or-ctrl')
    const node = selection.getSelectionStart()
    const paragraph = findNearestParagraph(node)
    const emojiNode = checkEditEmoji(node)
    contentState.selectedImage = null
    if (
      paragraph &&
      emojiNode &&
      event.key !== EVENT_KEYS.Enter &&
      event.key !== EVENT_KEYS.ArrowDown &&
      event.key !== EVENT_KEYS.ArrowUp &&
      event.key !== EVENT_KEYS.Tab &&
      event.key !== EVENT_KEYS.Escape
    ) {
      const reference = getParagraphReference(emojiNode, paragraph.id)
      eventCenter.dispatch('muya-emoji-picker', { reference, emojiNode })
    }
    if (!emojiNode) eventCenter.dispatch('muya-emoji-picker', { emojiNode })

    const { anchor, focus, start, end } = selection.getCursorRange()
    if (!anchor || !focus) return
    if (!keyboard.isComposed) {
      const { anchor: oldAnchor, focus: oldFocus } = contentState.cursor
      if (
        anchor.key !== oldAnchor.key ||
        anchor.offset !== oldAnchor.offset ||
        focus.key !== oldFocus.key ||
        focus.offset !== oldFocus.offset
      ) {
        const needRender =
          contentState.checkNeedRender(contentState.cursor) ||
          contentState.checkNeedRender({ start, end })
        contentState.cursor = { anchor, focus }
        if (needRender) return contentState.partialRender()
      }
    }

    const block = contentState.getBlock(anchor.key)
    if (
      anchor.key === focus.key &&
      anchor.offset !== focus.offset &&
      block.functionType !== 'codeContent' &&
      block.functionType !== 'languageInput'
    ) {
      const reference = contentState.getPositionReference()
      const { formats } = contentState.selectionFormats()
      eventCenter.dispatch('muya-format-picker', { reference, formats })
    } else {
      eventCenter.dispatch('muya-format-picker', { reference: null })
    }
  }

  eventCenter.attachDOMEvent(container, 'keyup', handler)
}

import { EVENT_KEYS } from '../config'
import { getImageInfo } from '../utils'

const shouldCaptureFloatKey = key => {
  return (
    key === EVENT_KEYS.Enter ||
    key === EVENT_KEYS.Escape ||
    key === EVENT_KEYS.Tab ||
    key === EVENT_KEYS.ArrowUp ||
    key === EVENT_KEYS.ArrowDown
  )
}

const hasBlockingFloat = shownFloat => {
  for (const tool in shownFloat) {
    if (
      tool === 'ag-format-picker' ||
      tool === 'ag-table-picker' ||
      tool === 'ag-quick-insert' ||
      tool === 'ag-emoji-picker' ||
      tool === 'ag-front-menu' ||
      tool === 'ag-list-picker' ||
      tool === 'ag-image-selector'
    ) {
      return true
    }
  }
  return false
}

export default function bindKeyboardKeydown(keyboard) {
  const { container, eventCenter, contentState } = keyboard.muya
  const docHandler = event => {
    switch (event.code) {
      case EVENT_KEYS.Enter:
        return contentState.docEnterHandler(event)
      case EVENT_KEYS.Space:
        if (contentState.selectedImage) {
          const { token } = contentState.selectedImage
          const { src } = getImageInfo(token.src || token.attrs.src)
          if (src) eventCenter.dispatch('preview-image', { data: src })
        }
        break
      case EVENT_KEYS.Backspace:
        return contentState.docBackspaceHandler(event)
      case EVENT_KEYS.Delete:
        return contentState.docDeleteHandler(event)
      case EVENT_KEYS.ArrowUp:
      case EVENT_KEYS.ArrowDown:
      case EVENT_KEYS.ArrowLeft:
      case EVENT_KEYS.ArrowRight:
        return contentState.docArrowHandler(event)
    }
  }

  const handler = event => {
    if (event.metaKey || event.ctrlKey) container.classList.add('ag-meta-or-ctrl')

    const languageInput = keyboard.languageInputFor(event.target)
    if (Object.keys(keyboard.shownFloat).length > 0 && shouldCaptureFloatKey(event.key)) {
      if (hasBlockingFloat(keyboard.shownFloat)) {
        event.preventDefault()
        if (languageInput) event.stopPropagation()
      }
      return
    }

    if (languageInput) {
      event.stopPropagation()
      if (event.key === EVENT_KEYS.Enter) {
        event.preventDefault()
        keyboard.commitLanguageInput(languageInput)
      } else if (event.key === EVENT_KEYS.Escape) {
        event.preventDefault()
        const block = contentState.getBlock(languageInput.id)
        if (block) languageInput.textContent = block.text
        eventCenter.dispatch('muya-code-picker', { reference: null })
      }
      return
    }

    switch (event.key) {
      case EVENT_KEYS.Backspace:
        contentState.backspaceHandler(event)
        break
      case EVENT_KEYS.Delete:
        contentState.deleteHandler(event)
        break
      case EVENT_KEYS.Enter:
        if (!keyboard.isComposed) {
          contentState.enterHandler(event)
          keyboard.muya.dispatchChange()
        }
        break
      case EVENT_KEYS.ArrowUp:
      case EVENT_KEYS.ArrowDown:
      case EVENT_KEYS.ArrowLeft:
      case EVENT_KEYS.ArrowRight:
        if (!keyboard.isComposed) contentState.arrowHandler(event)
        break
      case EVENT_KEYS.Tab:
        contentState.tabHandler(event)
        break
    }
  }

  eventCenter.attachDOMEvent(container, 'keydown', handler)
  eventCenter.attachDOMEvent(document, 'keydown', docHandler)
}

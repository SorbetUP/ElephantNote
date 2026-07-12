import { languageInputFor } from './keyboardLanguageInput'

export default function bindKeyboardComposition(keyboard) {
  const { container, eventCenter, contentState } = keyboard.muya
  const handler = event => {
    if (event.type === 'compositionstart') {
      keyboard.isComposed = true
    } else if (event.type === 'compositionend') {
      keyboard.isComposed = false
      if (languageInputFor(event.target)) return
      contentState.inputHandler(event)
      eventCenter.dispatch('stateChange')
    }
  }

  eventCenter.attachDOMEvent(container, 'compositionend', handler)
  eventCenter.attachDOMEvent(container, 'compositionstart', handler)
}

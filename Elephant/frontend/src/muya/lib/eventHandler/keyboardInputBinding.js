import { getParagraphReference } from '../utils'

export default function bindKeyboardInput(keyboard) {
  const { container, eventCenter, contentState } = keyboard.muya
  const showCodePicker = (paragraph, lang) => {
    if (lang && paragraph) {
      eventCenter.dispatch('muya-code-picker', {
        reference: getParagraphReference(paragraph, paragraph.id),
        lang,
        cb: item => {
          contentState.selectLanguage(paragraph, item.name)
          keyboard.muya.dispatchChange()
        }
      })
    } else {
      eventCenter.dispatch('muya-code-picker', { reference: null })
    }
  }

  const inputHandler = event => {
    const languageInput = keyboard.languageInputFor(event.target)
    if (languageInput) {
      showCodePicker(languageInput, String(languageInput.textContent || '').trim())
      return
    }

    if (!keyboard.isComposed) {
      contentState.inputHandler(event)
      keyboard.muya.dispatchChange()
    }

    const { lang, paragraph } = contentState.checkEditLanguage()
    showCodePicker(paragraph, lang)
  }

  const focusOutHandler = event => {
    const languageInput = keyboard.languageInputFor(event.target)
    if (!languageInput) return
    setTimeout(() => {
      if (languageInput.isConnected) keyboard.commitLanguageInput(languageInput)
    })
  }

  eventCenter.attachDOMEvent(container, 'input', inputHandler)
  eventCenter.attachDOMEvent(container, 'focusout', focusOutHandler)
}

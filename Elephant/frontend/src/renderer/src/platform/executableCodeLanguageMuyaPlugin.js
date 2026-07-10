import Muya from '../../../muya/lib'

export const CODE_LANGUAGE_EVENT = 'elephantnote-code-language-change'

const normalizeLanguage = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/^language-/, '')
  .replace(/^lang-/, '')

class ExecutableCodeLanguagePlugin {
  static pluginName = 'executableCodeLanguage'

  constructor(muya) {
    this.muya = muya
    this.handleLanguageChange = this.handleLanguageChange.bind(this)
    muya.eventCenter.attachDOMEvent(muya.container, CODE_LANGUAGE_EVENT, this.handleLanguageChange)
  }

  handleLanguageChange(event) {
    const detail = event.detail || {}
    const language = normalizeLanguage(detail.language)
    const blockKey = String(detail.blockKey || '')
    const contentState = this.muya?.contentState
    if (!language || !blockKey || !contentState) return

    const languageBlock = contentState.getBlock(blockKey)
    if (!languageBlock || languageBlock.functionType !== 'languageInput') return

    contentState.updateCodeLanguage(languageBlock, language)
    this.muya.dispatchChange()
    detail.handled = true
    event.stopPropagation()
  }
}

let registered = false

export const registerExecutableCodeLanguageMuyaPlugin = () => {
  if (registered) return
  registered = true
  Muya.use(ExecutableCodeLanguagePlugin)
}

export { ExecutableCodeLanguagePlugin }

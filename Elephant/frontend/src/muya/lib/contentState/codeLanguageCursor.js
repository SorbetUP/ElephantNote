import selection from '../selection'

export function checkEditLanguage() {
  const { start } = selection.getCursorRange()
  if (!start) return { lang: '', paragraph: null }
  const startBlock = this.getBlock(start.key)
  const paragraph = document.querySelector(`#${start.key}`)
  let lang = ''
  const { text } = startBlock
  if (startBlock.type === 'span') {
    if (startBlock.functionType === 'languageInput') {
      lang = String(paragraph?.textContent ?? text).trim()
    } else if (startBlock.functionType === 'paragraphContent') {
      const token = text.match(/(^`{3,})([^`]+)/)
      if (token && start.offset >= token[1].length) lang = token[2].trim()
    }
  }
  return { lang, paragraph }
}

export function selectLanguage(paragraph, lang) {
  const block = this.getBlock(paragraph.id)
  if (lang === 'math' && this.isGitlabCompatibilityEnabled && this.updateMathBlock(block)) return
  this.updateCodeLanguage(block, lang)
}

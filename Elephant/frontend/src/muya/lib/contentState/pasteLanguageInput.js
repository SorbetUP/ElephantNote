export const pasteLanguageInput = (contentState, startBlock, start, end, text) => {
  let language = text.trim().match(/^.*$/m)[0] || ''
  const oldLength = startBlock.text.length
  let offset = 0
  if (start.offset !== 0 || end.offset !== oldLength) {
    const preText = startBlock.text.substring(0, start.offset)
    const postText = startBlock.text.substring(end.offset)
    language = preText + language + postText
    offset = preText.length + language.length
  } else {
    offset = language.length
  }
  startBlock.text = language
  const key = startBlock.key
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.muya.eventCenter.dispatch('muya-code-picker', { reference: null })
  contentState.updateCodeLanguage(startBlock, language)
}

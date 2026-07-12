export const languageInputFor = target => {
  return target?.closest?.('.ag-language-input') || null
}

export const commitLanguageInput = (keyboard, element) => {
  if (!element?.id) return false
  const { contentState } = keyboard.muya
  const block = contentState.getBlock(element.id)
  if (!block || block.functionType !== 'languageInput') return false
  const language = String(element.textContent || '').trim()
  if (block.text === language) return false
  contentState.updateCodeLanguage(block, language)
  keyboard.muya.dispatchChange()
  return true
}

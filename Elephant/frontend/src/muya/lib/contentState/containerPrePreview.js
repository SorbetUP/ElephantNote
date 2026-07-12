import { FUNCTION_TYPE_LANG } from './containerLanguage'

export function createPreAndPreview(functionType, value = '') {
  const lang = FUNCTION_TYPE_LANG[functionType]
  const preBlock = this.createBlock('pre', {
    functionType,
    lang
  })
  const codeBlock = this.createBlock('code', { lang })
  this.appendChild(preBlock, codeBlock)

  if (typeof value === 'string' && value) {
    value = value.replace(/^\s+/, '')
    const codeContent = this.createBlock('span', {
      text: value,
      lang,
      functionType: 'codeContent'
    })
    this.appendChild(codeBlock, codeContent)
  } else {
    const emptyCodeContent = this.createBlock('span', {
      functionType: 'codeContent',
      lang
    })
    this.appendChild(codeBlock, emptyCodeContent)
  }

  const preview = this.createBlock('div', {
    editable: false,
    functionType
  })
  return { preBlock, preview }
}

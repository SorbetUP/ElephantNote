import { loadLanguage } from '../prism/index'

const CODE_UPDATE_REP = /^`{3,}(.*)/

export function codeBlockUpdate(block, code = '', lang) {
  if (block.type === 'span') block = this.getParent(block)
  if (block.type !== 'p' || block.children.length !== 1) return false

  const match = CODE_UPDATE_REP.exec(block.children[0].text)
  if (!match && !lang) return false
  const language = lang || (match ? match[1] : '')
  const codeBlock = this.createBlock('code', { lang: language })
  const codeContent = this.createBlock('span', {
    text: code,
    lang: language,
    functionType: 'codeContent'
  })
  const inputBlock = this.createBlock('span', {
    text: language,
    functionType: 'languageInput'
  })
  if (language) loadLanguage(language)

  Object.assign(block, {
    type: 'pre',
    functionType: 'fencecode',
    lang: language,
    text: '',
    history: null,
    children: []
  })
  this.appendChild(codeBlock, codeContent)
  this.appendChild(block, inputBlock)
  this.appendChild(block, codeBlock)
  const offset = code.length
  this.cursor = {
    start: { key: codeContent.key, offset },
    end: { key: codeContent.key, offset },
    isEdit: false
  }
  return true
}

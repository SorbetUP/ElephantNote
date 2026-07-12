import { loadLanguage } from '../prism/index'
import { escapeHTML } from '../utils'

export function updateCodeLanguage(block, lang) {
  if (typeof lang !== 'string') {
    console.error('Invalid code block language string:', lang)
    lang = ''
  }
  lang = escapeHTML(lang.trim())
  if (lang !== '') loadLanguage(lang)

  if (block.functionType === 'languageInput') {
    const preBlock = this.getParent(block)
    const nextSibling = this.getNextSibling(block)
    if (block.text !== lang || preBlock.text !== lang || nextSibling.text !== lang) {
      block.text = lang
      preBlock.lang = lang
      preBlock.functionType = 'fencecode'
      nextSibling.lang = lang
      nextSibling.children.forEach(child => (child.lang = lang))
    }
    const { key } = nextSibling.children[0]
    this.cursor = {
      start: { key, offset: 0 },
      end: { key, offset: 0 },
      isEdit: false
    }
  } else {
    block.text = block.text.replace(/^(`+)([^`]+$)/g, `$1${lang}`)
    this.codeBlockUpdate(block)
  }
  this.partialRender()
}

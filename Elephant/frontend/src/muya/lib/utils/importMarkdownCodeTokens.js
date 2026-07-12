import { loadLanguage } from '../prism/index'

const languageLoaded = new Set()

const append = (state, block) => {
  state.contentState.appendChild(state.parentList[0], block)
}

export default function importMarkdownCodeToken(state, token) {
  const contentState = state.contentState
  let block
  let value
  switch (token.type) {
    case 'frontmatter': {
      const { lang, style } = token
      value = token.text.replace(/^\s+/, '').replace(/\s$/, '')
      block = contentState.createBlock('pre', {
        functionType: token.type,
        lang,
        style
      })
      const codeBlock = contentState.createBlock('code', { lang })
      const codeContent = contentState.createBlock('span', {
        text: value,
        lang,
        functionType: 'codeContent'
      })
      contentState.appendChild(codeBlock, codeContent)
      contentState.appendChild(block, codeBlock)
      append(state, block)
      return true
    }
    case 'hr': {
      block = contentState.createBlock('hr')
      const thematicBreakContent = contentState.createBlock('span', {
        text: token.marker,
        functionType: 'thematicBreakLine'
      })
      contentState.appendChild(block, thematicBreakContent)
      append(state, block)
      return true
    }
    case 'heading': {
      const { headingStyle, depth, text, marker } = token
      value = headingStyle === 'atx' ? '#'.repeat(+depth) + ` ${text}` : text
      block = contentState.createBlock(`h${depth}`, { headingStyle })
      const headingContent = contentState.createBlock('span', {
        text: value,
        functionType: headingStyle === 'atx' ? 'atxLine' : 'paragraphContent'
      })
      contentState.appendChild(block, headingContent)
      if (marker) block.marker = marker
      append(state, block)
      return true
    }
    case 'multiplemath':
      block = contentState.createContainerBlock(
        token.type,
        token.text,
        token.mathStyle
      )
      append(state, block)
      return true
    case 'code': {
      const { codeBlockStyle, text, lang: infostring = '' } = token
      const lang = (infostring || '').match(/\S*/)[0]
      value = text
      if (
        state.options.trimUnnecessaryCodeBlockEmptyLines &&
        (value.endsWith('\n') || value.startsWith('\n'))
      ) {
        value = value.replace(/\n+$/, '').replace(/^\n+/, '')
      }
      if (/mermaid|flowchart|vega-lite|sequence|plantuml/.test(lang)) {
        block = contentState.createContainerBlock(lang, value)
        append(state, block)
        return true
      }

      block = contentState.createBlock('pre', {
        functionType: codeBlockStyle === 'fenced' ? 'fencecode' : 'indentcode',
        lang
      })
      const codeBlock = contentState.createBlock('code', { lang })
      const codeContent = contentState.createBlock('span', {
        text: value,
        lang,
        functionType: 'codeContent'
      })
      const inputBlock = contentState.createBlock('span', {
        text: lang,
        functionType: 'languageInput'
      })
      if (lang && !languageLoaded.has(lang)) {
        languageLoaded.add(lang)
        loadLanguage(lang)
          .then(infoList => {
            if (!Array.isArray(infoList)) return
            if (infoList.some(({ status }) => status === 'loaded')) {
              contentState.render()
            }
          })
          .catch(err => console.warn(err))
      }
      contentState.appendChild(codeBlock, codeContent)
      contentState.appendChild(block, inputBlock)
      contentState.appendChild(block, codeBlock)
      append(state, block)
      return true
    }
    default:
      return false
  }
}

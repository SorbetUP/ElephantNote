import { Lexer } from '../parser/marked'
import importMarkdownCodeToken from './importMarkdownCodeTokens'
import importMarkdownContentToken from './importMarkdownContentTokens'
import importMarkdownStructureToken from './importMarkdownStructureTokens'

const createRootState = () => ({
  key: null,
  type: 'root',
  text: '',
  parent: null,
  preSibling: null,
  nextSibling: null,
  children: []
})

const importMarkdownState = ContentState => {
  ContentState.prototype.markdownToState = function(
    markdown,
    checkCursorSignature = false
  ) {
    const rootState = createRootState()
    const options = this.muya.options
    const tokens = new Lexer({
      disableInline: true,
      footnote: options.footnote,
      isGitlabCompatibilityEnabled: options.isGitlabCompatibilityEnabled,
      superSubScript: options.superSubScript
    }).lex(markdown, checkCursorSignature)
    const state = {
      contentState: this,
      options,
      tokens,
      rootState,
      parentList: [rootState]
    }

    let token
    while ((token = tokens.shift())) {
      if (importMarkdownCodeToken(state, token)) continue
      if (importMarkdownContentToken(state, token)) continue
      if (importMarkdownStructureToken(state, token)) continue
      console.warn(`Unknown type ${token.type}`)
    }
    return rootState.children.length
      ? rootState.children
      : [this.createBlockP()]
  }

  ContentState.prototype.importMarkdown = function(
    markdown,
    checkCursorSignature = false
  ) {
    this.blocks = this.markdownToState(markdown, checkCursorSignature)
  }
}

export default importMarkdownState

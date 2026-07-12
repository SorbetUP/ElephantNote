import ExportMarkdown from '../utils/exportMarkdown'

const convertCodeBlockToStates = (contentState, codeBlock) => {
  const codeContent = codeBlock.children[1].children[0].text
  const states = contentState.markdownToState(codeContent)
  for (const state of states) contentState.insertBefore(state, codeBlock)
  contentState.removeBlock(codeBlock)
  const cursorBlock = contentState.firstInDescendant(states[0])
  const { key, text } = cursorBlock
  const offset = text.length
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
}

const createCodeBlock = (contentState, text) => {
  const lang = ''
  const preBlock = contentState.createBlock('pre', {
    functionType: 'fencecode',
    lang
  })
  const codeBlock = contentState.createBlock('code', { lang })
  const inputBlock = contentState.createBlock('span', {
    functionType: 'languageInput'
  })
  const codeContent = contentState.createBlock('span', {
    text,
    lang,
    functionType: 'codeContent'
  })
  contentState.appendChild(codeBlock, codeContent)
  contentState.appendChild(preBlock, inputBlock)
  contentState.appendChild(preBlock, codeBlock)
  return { preBlock, inputBlock }
}

const convertSingleBlock = (contentState, startBlock) => {
  if (startBlock.type !== 'span') {
    contentState.cursor = {
      start: contentState.cursor.start,
      end: contentState.cursor.end,
      isEdit: true
    }
    return
  }
  const anchorBlock = contentState.getParent(startBlock)
  const { preBlock, inputBlock } = createCodeBlock(
    contentState,
    startBlock.text
  )
  contentState.insertBefore(preBlock, anchorBlock)
  contentState.removeBlock(anchorBlock)
  const key = inputBlock.key
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
}

const convertMultipleBlocks = (contentState, parent, startIndex, endIndex) => {
  const children = parent ? parent.children : contentState.blocks
  const referBlock = children[endIndex]
  const { isGitlabCompatibilityEnabled, listIndentation } = contentState
  const markdown = new ExportMarkdown(
    children.slice(startIndex, endIndex + 1),
    listIndentation,
    isGitlabCompatibilityEnabled
  ).generate()
  const { preBlock, inputBlock } = createCodeBlock(contentState, markdown)
  contentState.insertAfter(preBlock, referBlock)
  const removeCache = []
  for (let index = startIndex; index <= endIndex; index++) {
    removeCache.push(children[index])
  }
  removeCache.forEach(block => contentState.removeBlock(block))
  const key = inputBlock.key
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
}

const paragraphCodeBlock = ContentState => {
  ContentState.prototype.handleCodeBlockMenu = function() {
    const { start, end, affiliation } = this.selectionChange(this.cursor)
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    const startParents = this.getParents(startBlock)
    const endParents = this.getParents(endBlock)
    const hasFencedCodeBlockParent = () => {
      return [...startParents, ...endParents].some(
        block => block.type === 'pre' && /code/.test(block.functionType)
      )
    }

    if (
      affiliation.length &&
      affiliation[0].type === 'pre' &&
      /code/.test(affiliation[0].functionType)
    ) {
      convertCodeBlockToStates(this, affiliation[0])
    } else if (start.key === end.key) {
      convertSingleBlock(this, startBlock)
    } else if (!hasFencedCodeBlockParent()) {
      const { parent, startIndex, endIndex } = this.getCommonParent()
      convertMultipleBlocks(this, parent, startIndex, endIndex)
    }
  }
}

export default paragraphCodeBlock

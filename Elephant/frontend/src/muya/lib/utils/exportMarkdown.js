import {
  insertLineBreak,
  translateBlocks2Markdown
} from './exportMarkdownBlocks'
import {
  normalizeBlockquote,
  normalizeCodeBlock,
  normalizeContainer,
  normalizeFrontMatter,
  normalizeHeaderText,
  normalizeHTML,
  normalizeMultipleMath,
  normalizeParagraphText
} from './exportMarkdownText'
import normalizeMarkdownTable from './exportMarkdownTable'
import {
  normalizeFootnote,
  normalizeList,
  normalizeListItem
} from './exportMarkdownLists'

class ExportMarkdown {
  constructor(blocks, listIndentation = 1, isGitlabCompatibilityEnabled = false) {
    this.blocks = blocks
    this.listType = []
    this.isLooseParentList = true
    this.isGitlabCompatibilityEnabled = !!isGitlabCompatibilityEnabled
    this.listIndentation = 'number'
    if (listIndentation === 'dfm') {
      this.listIndentation = 'dfm'
      this.listIndentationCount = 4
    } else if (typeof listIndentation === 'number') {
      this.listIndentationCount = Math.min(Math.max(listIndentation, 1), 4)
    } else {
      this.listIndentationCount = 1
    }
  }

  generate() {
    return this.translateBlocks2Markdown(this.blocks)
  }

  translateBlocks2Markdown(blocks, indent = '', listIndent = '') {
    return translateBlocks2Markdown(this, blocks, indent, listIndent)
  }

  insertLineBreak(result, indent) {
    return insertLineBreak(result, indent)
  }

  normalizeParagraphText(block, indent) {
    return normalizeParagraphText(block, indent)
  }

  normalizeHeaderText(block, indent) {
    return normalizeHeaderText(block, indent)
  }

  normalizeBlockquote(block, indent) {
    return normalizeBlockquote(this, block, indent)
  }

  normalizeFrontMatter(block, indent) {
    return normalizeFrontMatter(block, indent)
  }

  normalizeMultipleMath(block, indent) {
    return normalizeMultipleMath(this, block, indent)
  }

  normalizeContainer(block, indent) {
    return normalizeContainer(block, indent)
  }

  normalizeCodeBlock(block, indent) {
    return normalizeCodeBlock(block, indent)
  }

  normalizeHTML(block, indent) {
    return normalizeHTML(block, indent)
  }

  normalizeTable(table, indent) {
    return normalizeMarkdownTable(table, indent)
  }

  normalizeList(block, indent, listIndent) {
    return normalizeList(this, block, indent, listIndent)
  }

  normalizeListItem(block, indent) {
    return normalizeListItem(this, block, indent)
  }

  normalizeFootnote(block, indent) {
    return normalizeFootnote(this, block, indent)
  }
}

export default ExportMarkdown

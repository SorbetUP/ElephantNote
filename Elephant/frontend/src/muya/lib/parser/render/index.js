import { CLASS_OR_ID } from '../../config'
import { conflict, mixins, camelToSnake } from '../../utils'
import { beginRules } from '../rules'
import renderInlines from './renderInlines'
import renderBlock from './renderBlock'
import { renderDiagramCache, renderMermaidCache } from './asyncRenderers'
import {
  invalidateImageCache,
  renderDocument,
  renderPartialDocument,
  renderSingleBlock
} from './renderOperations'

class StateRender {
  constructor(muya) {
    this.muya = muya
    this.eventCenter = muya.eventCenter
    this.codeCache = new Map()
    this.loadImageMap = new Map()
    this.loadMathMap = new Map()
    this.mermaidCache = new Map()
    this.diagramCache = new Map()
    this.tokenCache = new Map()
    this.labels = new Map()
    this.urlMap = new Map()
    this.renderingTable = null
    this.renderingRowContainer = null
    this.container = null
  }

  setContainer(container) {
    this.container = container
  }

  collectLabels(blocks) {
    this.labels.clear()

    const travel = (block) => {
      const { text, children } = block
      if (children && children.length) {
        children.forEach((child) => travel(child))
      } else if (text) {
        const tokens = beginRules.reference_definition.exec(text)
        if (tokens) {
          const key = (tokens[2] + tokens[3]).toLowerCase()
          if (!this.labels.has(key)) {
            this.labels.set(key, {
              href: tokens[6],
              title: tokens[10] || ''
            })
          }
        }
      }
    }

    blocks.forEach((block) => travel(block))
  }

  checkConflicted(block, token, cursor) {
    const { start, end } = cursor
    const key = block.key
    const { start: tokenStart, end: tokenEnd } = token.range

    if (key !== start.key && key !== end.key) {
      return false
    } else if (key === start.key && key !== end.key) {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset])
    } else if (key !== start.key && key === end.key) {
      return conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    }
    return (
      conflict([tokenStart, tokenEnd], [start.offset, start.offset]) ||
      conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    )
  }

  getClassName(outerClass, block, token, cursor) {
    return (
      outerClass ||
      (this.checkConflicted(block, token, cursor) ? CLASS_OR_ID.AG_GRAY : CLASS_OR_ID.AG_HIDE)
    )
  }

  getHighlightClassName(active) {
    return active ? CLASS_OR_ID.AG_HIGHLIGHT : CLASS_OR_ID.AG_SELECTION
  }

  getSelector(block, activeBlocks) {
    const { cursor, selectedBlock } = this.muya.contentState
    const type = block.type === 'hr' ? 'p' : block.type
    const isActive = activeBlocks.some((item) => item.key === block.key) || block.key === cursor.start.key

    let selector = `${type}#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}`
    if (isActive) selector += `.${CLASS_OR_ID.AG_ACTIVE}`
    if (type === 'span') selector += `.ag-${camelToSnake(block.functionType)}`
    if (!block.parent && selectedBlock && block.key === selectedBlock.key) {
      selector += `.${CLASS_OR_ID.AG_SELECTED}`
    }
    return selector
  }

  renderMermaid() {
    return renderMermaidCache(this)
  }

  renderDiagram() {
    return renderDiagramCache(this)
  }

  render(blocks, activeBlocks, matches) {
    return renderDocument(this, blocks, activeBlocks, matches)
  }

  partialRender(blocks, activeBlocks, matches, startKey, endKey) {
    return renderPartialDocument(this, blocks, activeBlocks, matches, startKey, endKey)
  }

  singleRender(block, activeBlocks, matches) {
    return renderSingleBlock(this, block, activeBlocks, matches)
  }

  invalidateImageCache() {
    return invalidateImageCache(this)
  }
}

mixins(StateRender, renderInlines, renderBlock)

export default StateRender

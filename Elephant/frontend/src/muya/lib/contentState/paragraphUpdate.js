import {
  insertHorizontalRule,
  transformHeading
} from './paragraphHeadingActions'

const HEADING_ACTIONS = new Set([
  'heading 1',
  'heading 2',
  'heading 3',
  'heading 4',
  'heading 5',
  'heading 6',
  'upgrade heading',
  'degrade heading',
  'paragraph'
])

const normalizeResetAction = (contentState, block, paraType) => {
  if (paraType !== 'reset-to-paragraph') return paraType
  const blockType = contentState.getTypeFromBlock(block)
  if (!blockType || blockType === 'table') return null
  return /heading|hr/.test(blockType) ? 'paragraph' : blockType
}

const routeParagraphAction = (
  contentState,
  paraType,
  insertMode,
  block,
  start,
  end
) => {
  let needDispatchChange = true
  switch (paraType) {
    case 'front-matter':
      contentState.handleFrontMatter()
      break
    case 'ul-bullet':
    case 'ul-task':
    case 'ol-order':
      needDispatchChange = contentState.handleListMenu(paraType, insertMode)
      break
    case 'loose-list-item':
      contentState.handleLooseListItem()
      break
    case 'pre':
      contentState.handleCodeBlockMenu()
      break
    case 'blockquote':
      contentState.handleQuoteMenu(insertMode)
      break
    case 'mathblock':
      contentState.insertContainerBlock('multiplemath', block)
      break
    case 'table':
      contentState.showTablePicker()
      break
    case 'html':
      contentState.insertHtmlBlock(block)
      break
    case 'flowchart':
    case 'sequence':
    case 'plantuml':
    case 'mermaid':
    case 'vega-lite':
      contentState.insertContainerBlock(paraType, block)
      break
    case 'hr':
      insertHorizontalRule(contentState, block, block.text)
      break
    default:
      if (HEADING_ACTIONS.has(paraType)) {
        const result = transformHeading(
          contentState,
          paraType,
          block,
          start,
          end
        )
        if (result.stop) return { stop: true, needDispatchChange }
      }
      break
  }
  return { stop: false, needDispatchChange }
}

const paragraphUpdate = ContentState => {
  ContentState.prototype.updateParagraph = function(
    paraType,
    insertMode = false
  ) {
    const { start, end } = this.cursor
    const block = this.getBlock(start.key)
    if (!this.isAllowedTransformation(block, paraType, start.key !== end.key)) {
      return
    }

    paraType = normalizeResetAction(this, block, paraType)
    if (!paraType) return
    const { stop, needDispatchChange } = routeParagraphAction(
      this,
      paraType,
      insertMode,
      block,
      start,
      end
    )
    if (stop) return

    if (paraType === 'front-matter' || paraType === 'pre') {
      this.render()
    } else {
      this.partialRender()
    }

    if (needDispatchChange) {
      // Intentionally preserved: dispatch remains owned by callers/stateChange.
    }
  }
}

export default paragraphUpdate

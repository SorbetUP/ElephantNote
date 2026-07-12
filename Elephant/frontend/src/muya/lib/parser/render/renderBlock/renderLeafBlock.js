import { CLASS_OR_ID } from '../../../config'
import { h } from '../snabbdom'
import { renderTextChildren } from './renderLeafHighlights'
import renderLeafPreview from './renderLeafPreviews'
import renderLeafCode from './renderLeafCode'

export default function renderLeafBlock(parent, block, activeBlocks, matches, useCache = false, t) {
  const { cursor } = this.muya.contentState
  let selector = this.getSelector(block, activeBlocks)
  const highlights = matches.filter(m => m.key === block.key)
  const { type, checked, key, functionType, editable } = block
  const data = {
    props: {},
    attrs: {},
    dataset: {},
    style: {}
  }

  let children = renderTextChildren(this, block, highlights, useCache, cursor)

  if (editable === false) {
    Object.assign(data.attrs, {
      spellcheck: 'false',
      contenteditable: 'false'
    })
  }

  const previewResult = renderLeafPreview(this, block, data, selector, children, t)
  if (previewResult.handled) {
    selector = previewResult.selector
    children = previewResult.children
  } else if (type === 'input') {
    const { fontSize, lineHeight } = this.muya.options
    Object.assign(data.attrs, {
      type: 'checkbox',
      style: `top: ${(fontSize * lineHeight / 2 - 8).toFixed(2)}px`
    })
    selector = `${type}#${key}.${CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX}`
    if (checked) {
      Object.assign(data.attrs, { checked: true })
      selector += `.${CLASS_OR_ID.AG_CHECKBOX_CHECKED}`
    }
    children = ''
  } else {
    const codeResult = renderLeafCode(block, highlights, selector, children)
    if (codeResult.handled) {
      selector = codeResult.selector
      children = codeResult.children
    } else if (type === 'span' && functionType === 'footnoteInput') {
      Object.assign(data.attrs, { spellcheck: 'false' })
    }
  }

  if (!block.parent) {
    return h(selector, data, [this.renderIcon(block), ...children])
  }
  return h(selector, data, children)
}

import { h } from '../snabbdom'
import { renderContainerCode } from './renderContainerCode'
import { renderContainerSemantic } from './renderContainerSemantic'

export default function renderContainerBlock(parent, block, activeBlocks, matches, useCache = false, t) {
  let selector = this.getSelector(block, activeBlocks)
  const { type, editable } = block

  if (type === 'table') this.renderingTable = block
  else if (/thead|tbody/.test(type)) this.renderingRowContainer = block

  const children = block.children.map(child => {
    return this.renderBlock(block, child, activeBlocks, matches, useCache, t)
  })
  const data = { attrs: {}, dataset: {} }

  if (editable === false) {
    Object.assign(data.attrs, {
      contenteditable: 'false',
      spellcheck: 'false'
    })
  }

  selector = renderContainerCode(selector, data, children, block, t)
  selector = renderContainerSemantic(
    this,
    parent,
    block,
    activeBlocks,
    selector,
    data,
    children,
    t
  )

  if (!block.parent) children.unshift(this.renderIcon(block, t))
  return h(selector, data, children)
}

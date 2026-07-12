import { CLASS_OR_ID } from '../../config'
import { patch, toVNode, toHTML, h } from './snabbdom'

const translate = (stateRender) => stateRender.muya.options.t || ((key) => key)

const finishRender = (stateRender) => {
  stateRender.renderMermaid()
  stateRender.renderDiagram()
  stateRender.codeCache.clear()
}

export const renderDocument = (stateRender, blocks, activeBlocks, matches) => {
  const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
  const t = translate(stateRender)
  const children = blocks.map((block) => {
    return stateRender.renderBlock(null, block, activeBlocks, matches, true, t)
  })
  const newVdom = h(selector, children)
  const rootDom = document.querySelector(selector) || stateRender.container
  const oldVdom = toVNode(rootDom)

  patch(oldVdom, newVdom)
  finishRender(stateRender)
}

const collectOldDoms = (startKey, endKey) => {
  const firstOldDom = startKey
    ? document.querySelector(`#${startKey}`)
    : document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`).firstElementChild
  if (!firstOldDom) return null

  const needToRemoved = [firstOldDom]
  let nextSibling = firstOldDom.nextElementSibling
  while (nextSibling && nextSibling.id !== endKey) {
    needToRemoved.push(nextSibling)
    nextSibling = nextSibling.nextElementSibling
  }
  if (nextSibling) needToRemoved.push(nextSibling)
  return { firstOldDom, needToRemoved }
}

const renderCursorBlock = (stateRender, cursorOutMostBlock, activeBlocks, matches, t) => {
  const cursorDom = document.querySelector(`#${cursorOutMostBlock.key}`)
  if (!cursorDom) return
  const oldCursorVnode = toVNode(cursorDom)
  const newCursorVnode = stateRender.renderBlock(
    null,
    cursorOutMostBlock,
    activeBlocks,
    matches,
    false,
    t
  )
  patch(oldCursorVnode, newCursorVnode)
}

export const renderPartialDocument = (
  stateRender,
  blocks,
  activeBlocks,
  matches,
  startKey,
  endKey
) => {
  const cursorOutMostBlock = activeBlocks[activeBlocks.length - 1]
  const needRenderCursorBlock = blocks.indexOf(cursorOutMostBlock) === -1
  const t = translate(stateRender)
  const newVnode = h(
    'section',
    blocks.map((block) => stateRender.renderBlock(null, block, activeBlocks, matches, false, t))
  )
  const html = toHTML(newVnode).replace(/^<section>([\s\S]+?)<\/section>$/, '$1')
  const oldDoms = collectOldDoms(startKey, endKey)
  if (!oldDoms) return

  oldDoms.firstOldDom.insertAdjacentHTML('beforebegin', html)
  oldDoms.needToRemoved.forEach((dom) => dom.remove())

  if (needRenderCursorBlock) {
    renderCursorBlock(stateRender, cursorOutMostBlock, activeBlocks, matches, t)
  }
  finishRender(stateRender)
}

export const renderSingleBlock = (stateRender, block, activeBlocks, matches) => {
  const selector = `#${block.key}`
  const t = translate(stateRender)
  const newVdom = stateRender.renderBlock(null, block, activeBlocks, matches, true, t)
  const rootDom = document.querySelector(selector)
  const oldVdom = toVNode(rootDom)
  patch(oldVdom, newVdom)
  finishRender(stateRender)
}

export const invalidateImageCache = (stateRender) => {
  stateRender.loadImageMap.forEach((imageInfo, key) => {
    imageInfo.touchMsec = Date.now()
    stateRender.loadImageMap.set(key, imageInfo)
  })
}

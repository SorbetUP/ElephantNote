import { createSelectionSnapshot, restoreSelectionSnapshot } from './selectionRuntime.js'
import { jsonStateToHtml, markdownToJsonState } from './jsonStateRuntime.js'
import { domToMarkdown } from './liveRenderingRuntime.js'

export const findCurrentMuyaBlock = (root, doc = globalThis.document) => {
  const selection = doc?.getSelection?.() || globalThis.getSelection?.()
  if (!root || !selection || selection.rangeCount === 0) return null
  let node = selection.getRangeAt(0).startContainer
  if (node?.nodeType === 3) node = node.parentElement
  return node?.closest?.('[data-muya-block]') || null
}

export const blockToLiveMarkdown = (node) => {
  const type = node?.dataset?.muyaBlock || node?.tagName?.toLowerCase()
  const text = node?.textContent || ''
  if (type === 'heading' || /^h[1-6]$/.test(type)) {
    const level = Number(node.tagName?.slice(1)) || 1
    return `${'#'.repeat(level)} ${text.trim()}`
  }
  if (text.trim().startsWith('# ')) return text.trim()
  if (text.trim().startsWith('## ')) return text.trim()
  if (text.trim().startsWith('### ')) return text.trim()
  if (text.trim().startsWith('> ')) return text.trim()
  if (text.trim().startsWith('- [ ] ') || text.trim().startsWith('- [x] ')) return text.trim()
  if (text.trim().startsWith('- ')) return text.trim()
  return text.trim()
}

export const renderCurrentBlockNow = ({ root, setState, getDocument = () => globalThis.document } = {}) => {
  const doc = getDocument()
  const block = findCurrentMuyaBlock(root, doc)
  if (!root || !block || !doc) return null
  const selection = createSelectionSnapshot(root)
  const blockMarkdown = blockToLiveMarkdown(block)
  const blockState = markdownToJsonState(blockMarkdown).blocks[0]
  if (!blockState) return null
  const template = doc.createElement('template')
  template.innerHTML = jsonStateToHtml({ blocks: [blockState] })
  const replacement = template.content.firstElementChild
  block.replaceWith(replacement)
  const nextState = markdownToJsonState(domToMarkdown(root))
  setState(nextState)
  restoreSelectionSnapshot(root, selection, doc)
  return { state: nextState, block: replacement }
}

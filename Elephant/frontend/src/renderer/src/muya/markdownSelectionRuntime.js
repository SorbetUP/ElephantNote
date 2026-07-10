import { blockNodeToMarkdown } from './liveRenderingRuntime.js'

const childBlocks = (root) => [...(root?.children || [])]
const blockMarkdown = (node) => blockNodeToMarkdown(node) ?? ''

const topLevelBlock = (root, node) => {
  let current = node
  while (current?.parentNode && current.parentNode !== root) current = current.parentNode
  return current?.parentNode === root ? current : null
}

const textOffsetWithin = (container, node, offset) => {
  const doc = container?.ownerDocument
  if (!doc?.createRange || !node) return 0
  try {
    const range = doc.createRange()
    range.setStart(container, 0)
    range.setEnd(node, Math.min(offset, node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length))
    return range.toString().length
  } catch {
    return 0
  }
}

const syntaxContentStart = (block, markdown) => {
  const type = block?.dataset?.muyaBlock || block?.tagName?.toLowerCase() || ''
  if (type === 'heading' || /^h[1-6]$/.test(type)) {
    const level = Number(block.tagName?.slice(1)) || 1
    return level + 1
  }
  if (type === 'blockquote') return 2
  if (type === 'code_fence' || type === 'pre') {
    const firstBreak = markdown.indexOf('\n')
    return firstBreak < 0 ? 0 : firstBreak + 1
  }
  if (type === 'math_block') return 3
  const visible = block?.textContent || ''
  const exact = markdown.indexOf(visible)
  if (exact >= 0) return exact
  const trimmed = visible.trim()
  return trimmed ? Math.max(0, markdown.indexOf(trimmed)) : 0
}

const tablePointOffset = (table, node, offset, markdown) => {
  const cell = node?.nodeType === 1 ? node.closest?.('th,td') : node?.parentElement?.closest?.('th,td')
  if (!cell || !table.contains(cell)) return null
  const row = cell.parentElement
  const cells = [...row.querySelectorAll(':scope > th, :scope > td')]
  const column = Math.max(0, cells.indexOf(cell))
  const isHeader = cell.tagName?.toLowerCase() === 'th'
  const bodyRows = [...table.querySelectorAll('tbody tr')]
  const rowIndex = isHeader ? 0 : bodyRows.indexOf(row) + 2
  const lines = markdown.split('\n')
  if (rowIndex < 0 || rowIndex >= lines.length) return null
  const previousLines = lines.slice(0, rowIndex).reduce((sum, line) => sum + line.length + 1, 0)
  const rowCells = isHeader
    ? [...table.querySelectorAll('thead th')]
    : [...row.querySelectorAll(':scope > td')]
  const previousCells = rowCells.slice(0, column).reduce((sum, item) => sum + (item.textContent || '').trim().length + 3, 0)
  const inCell = textOffsetWithin(cell, node, offset)
  return previousLines + 2 + previousCells + inCell
}

const rootPointOffset = (root, offset) => {
  const blocks = childBlocks(root)
  const count = Math.max(0, Math.min(Number(offset) || 0, blocks.length))
  return blocks.slice(0, count).reduce((sum, item, index) => (
    sum + blockMarkdown(item).length + (index < count - 1 ? 2 : 0)
  ), 0)
}

const pointToMarkdownOffset = (root, node, offset) => {
  if (node === root) return rootPointOffset(root, offset)
  const blocks = childBlocks(root)
  const block = topLevelBlock(root, node)
  if (!block) return 0
  const blockIndex = blocks.indexOf(block)
  const before = blocks.slice(0, blockIndex).reduce((sum, item) => sum + blockMarkdown(item).length + 2, 0)
  const markdown = blockMarkdown(block)
  if (block.matches?.('table,[data-muya-block="table"]')) {
    const tableOffset = tablePointOffset(block, node, offset, markdown)
    if (tableOffset != null) return before + Math.min(markdown.length, tableOffset)
  }
  const contentStart = syntaxContentStart(block, markdown)
  const visibleOffset = textOffsetWithin(block, node, offset)
  return before + Math.min(markdown.length, contentStart + visibleOffset)
}

export const readMarkdownSelection = (root, selection = globalThis.getSelection?.()) => {
  if (!root || !selection || selection.rangeCount === 0) return null
  if (!selection.anchorNode || !selection.focusNode) return null
  if (selection.anchorNode !== root && !root.contains(selection.anchorNode)) return null
  if (selection.focusNode !== root && !root.contains(selection.focusNode)) return null
  return {
    anchor: pointToMarkdownOffset(root, selection.anchorNode, selection.anchorOffset),
    focus: pointToMarkdownOffset(root, selection.focusNode, selection.focusOffset)
  }
}

const textPointAt = (container, offset) => {
  const doc = container?.ownerDocument
  const nodeFilter = doc?.defaultView?.NodeFilter
  if (!doc?.createTreeWalker || !nodeFilter) return { node: container, offset: 0 }
  const walker = doc.createTreeWalker(container, nodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let node = walker.nextNode()
  let last = null
  while (node) {
    last = node
    const length = node.nodeValue?.length || 0
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }
  return last
    ? { node: last, offset: last.nodeValue?.length || 0 }
    : { node: container, offset: 0 }
}

const tablePointAt = (table, localOffset, markdown) => {
  const lines = markdown.split('\n')
  let lineStart = 0
  let rowIndex = 0
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = lineStart + lines[index].length
    if (localOffset <= lineEnd) { rowIndex = index; break }
    lineStart = lineEnd + 1
    rowIndex = index
  }
  if (rowIndex === 1) {
    const header = table.querySelector('thead th') || table
    return textPointAt(header, 0)
  }
  const row = rowIndex === 0
    ? table.querySelector('thead tr')
    : table.querySelectorAll('tbody tr')[Math.max(0, rowIndex - 2)]
  if (!row) return textPointAt(table, table.textContent?.length || 0)
  const cells = [...row.querySelectorAll(':scope > th, :scope > td')]
  let remaining = Math.max(0, localOffset - lineStart - 2)
  for (const cell of cells) {
    const length = (cell.textContent || '').trim().length
    if (remaining <= length) return textPointAt(cell, remaining)
    remaining -= length + 3
  }
  return textPointAt(cells.at(-1) || row, cells.at(-1)?.textContent?.length || 0)
}

const markdownOffsetToPoint = (root, markdownOffset) => {
  const blocks = childBlocks(root)
  let start = 0
  for (const block of blocks) {
    const markdown = blockMarkdown(block)
    const end = start + markdown.length
    if (markdownOffset <= end) {
      const local = Math.max(0, markdownOffset - start)
      if (block.matches?.('table,[data-muya-block="table"]')) return tablePointAt(block, local, markdown)
      const contentStart = syntaxContentStart(block, markdown)
      return textPointAt(block, Math.max(0, local - contentStart))
    }
    start = end + 2
  }
  const last = blocks.at(-1) || root
  return textPointAt(last, last.textContent?.length || 0)
}

export const restoreMarkdownSelection = (root, selection, doc = root?.ownerDocument) => {
  if (!root || !selection || !doc?.createRange) return false
  const browserSelection = doc.defaultView?.getSelection?.() || globalThis.getSelection?.()
  if (!browserSelection) return false
  const backward = selection.anchor > selection.focus
  const startOffset = backward ? selection.focus : selection.anchor
  const endOffset = backward ? selection.anchor : selection.focus
  const start = markdownOffsetToPoint(root, startOffset)
  const end = markdownOffsetToPoint(root, endOffset)
  const range = doc.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    browserSelection.removeAllRanges()
    browserSelection.addRange(range)
    if (backward && typeof browserSelection.extend === 'function') {
      browserSelection.collapse(end.node, end.offset)
      browserSelection.extend(start.node, start.offset)
    }
    return true
  } catch {
    return false
  }
}

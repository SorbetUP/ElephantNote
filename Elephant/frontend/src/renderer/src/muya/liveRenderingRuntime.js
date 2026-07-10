import { createSelectionSnapshot, restoreSelectionSnapshot } from './selectionRuntime.js'
import { jsonStateToMarkdown, markdownToJsonState, renderJsonStateIntoDom } from './jsonStateRuntime.js'

const editableText = (node) => {
  if (!node?.cloneNode) return node?.textContent || ''
  const clone = node.cloneNode(true)
  clone.querySelectorAll?.('[data-muya-ui="true"]').forEach((item) => item.remove())
  return clone.textContent || ''
}

export const domToMarkdown = (root) => {
  if (!root) return ''
  const nodes = [...root.childNodes]
  if (!nodes.length) return ''
  return nodes.map((node) => blockNodeToMarkdown(node)).filter((value) => value !== null && value !== undefined).join('\n\n').trim()
}

export const blockNodeToMarkdown = (node) => {
  if (!node) return ''
  if (node.nodeType === 3) return node.nodeValue || ''
  const type = node?.dataset?.muyaBlock || node?.tagName?.toLowerCase()
  const text = editableText(node)
  if (type === 'heading' || /^h[1-6]$/.test(type)) {
    const level = Number(node.tagName?.slice(1)) || 1
    return `${'#'.repeat(level)} ${text.trim()}`
  }
  if (type === 'blockquote') return `> ${text.trim()}`
  if (type === 'list_item' || type === 'task_list_item') {
    const item = node.querySelector?.('li') || node
    const content = editableText(item).trim()
    const depth = Number(node.dataset?.depth || 0)
    const indent = '  '.repeat(Math.max(0, depth))
    if (type === 'task_list_item') {
      const checked = Boolean(node.querySelector?.('input[type="checkbox"]')?.checked)
      return `${indent}- [${checked ? 'x' : ' '}] ${content}`
    }
    const ordered = node.tagName?.toLowerCase() === 'ol'
    const marker = ordered ? `${Number(node.getAttribute?.('start')) || 1}.` : '-'
    return `${indent}${marker} ${content}`
  }
  if (type === 'code_fence' || type === 'pre') {
    const code = node.querySelector?.('code')
    const language = [...(code?.classList || [])].find((item) => item.startsWith('language-'))?.replace('language-', '') || ''
    return `\`\`\`${language}\n${code?.textContent || text}\n\`\`\``
  }
  if (type === 'math_block') {
    const code = node.querySelector?.('code')?.textContent || node.dataset?.latex || text
    return `$$\n${code}\n$$`
  }
  if (type === 'table') return tableNodeToMarkdown(node.querySelector?.('table') || node)
  return text.trim()
}

export const tableNodeToMarkdown = (table) => {
  const headers = [...table.querySelectorAll('thead th')].map((item) => editableText(item).trim())
  const alignments = [...table.querySelectorAll('thead th')].map((item) => {
    const align = item.style?.textAlign || 'default'
    return align === 'left' ? ':-' : align === 'center' ? ':-:' : align === 'right' ? '-:' : '-'
  })
  const rows = [...table.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => editableText(cell).trim()))
  if (!headers.length) return ''
  return [`| ${headers.join(' | ')} |`, `| ${alignments.join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

export const createLiveRenderScheduler = ({ root, getState, setState, getDocument = () => globalThis.document, delay = 0 } = {}) => {
  let frame = null
  const renderNow = () => {
    if (!root) return null
    const doc = getDocument()
    const selection = createSelectionSnapshot(root)
    const nextMarkdown = domToMarkdown(root)
    const nextState = markdownToJsonState(nextMarkdown)
    setState(nextState)
    renderJsonStateIntoDom(root, nextState, doc)
    restoreSelectionSnapshot(root, selection, doc)
    return { markdown: jsonStateToMarkdown(nextState), state: nextState }
  }
  const schedule = () => {
    if (frame) return frame
    const runner = () => { frame = null; renderNow() }
    frame = delay > 0 ? setTimeout(runner, delay) : requestAnimationFrameSafe(runner)
    return frame
  }
  const cancel = () => {
    if (!frame) return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    else clearTimeout(frame)
    frame = null
  }
  return { schedule, renderNow, cancel, getState }
}

const requestAnimationFrameSafe = (callback) => {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return setTimeout(callback, 0)
}

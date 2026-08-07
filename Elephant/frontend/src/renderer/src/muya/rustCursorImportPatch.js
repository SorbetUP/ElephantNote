import ContentState from '../../../muya/lib/contentState'
import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../../../muya/lib/config'
import StableCompleteMuyaWithRustCore from './completeMuyaRustAdapter.js.wrapper.js'

const PATCH_FLAG = '__elephantRustCursorImportPatched'
const EMPTY_LIST_EXIT_PATCH_FLAG = '__elephantRustEmptyListExitPatched'
const EMPTY_BLOCK_SENTINEL = '\u2060'
const EMPTY_LIST_ITEM = /^(?: {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?)[ \t]*$/

const withoutCursorSignatures = (line) => String(line || '')
  .split(CURSOR_ANCHOR_DNA).join('')
  .split(CURSOR_FOCUS_DNA).join('')

export const preserveEmptyListCursorPayload = (markdown) => String(markdown || '')
  .split('\n')
  .map((line) => {
    const hasCursor = line.includes(CURSOR_ANCHOR_DNA) || line.includes(CURSOR_FOCUS_DNA)
    if (!hasCursor || !EMPTY_LIST_ITEM.test(withoutCursorSignatures(line))) return line

    // The legacy list lexer recursively tokenizes each item. A second empty item
    // containing only cursor signatures is otherwise consumed without producing
    // an editable paragraph token, and importCursor silently falls back to the
    // first document block. Keep one temporary non-rendering payload so the
    // signatures survive parsing into the correct empty list item.
    return `${line}${EMPTY_BLOCK_SENTINEL}`
  })
  .join('\n')

const removeSentinelFromBlocks = (blocks) => {
  for (const block of blocks || []) {
    if (typeof block?.text === 'string' && block.text.includes(EMPTY_BLOCK_SENTINEL)) {
      block.text = block.text.split(EMPTY_BLOCK_SENTINEL).join('')
    }
    if (block?.children?.length) removeSentinelFromBlocks(block.children)
  }
}

export const installRustCursorImportPatch = () => {
  const prototype = ContentState?.prototype
  if (!prototype || prototype[PATCH_FLAG] === true) return false

  const originalAddCursorToMarkdown = prototype.addCursorToMarkdown
  const originalConvertCursor = prototype.convertMuyaIndexCursortoCursor
  if (typeof originalAddCursorToMarkdown !== 'function' || typeof originalConvertCursor !== 'function') {
    throw new Error('Muya cursor import contracts are unavailable')
  }

  prototype.addCursorToMarkdown = function(markdown, cursor) {
    const result = originalAddCursorToMarkdown.call(this, markdown, cursor)
    if (!result || result.isValid !== true) return result
    return {
      ...result,
      markdown: preserveEmptyListCursorPayload(result.markdown)
    }
  }

  prototype.convertMuyaIndexCursortoCursor = function(cursor) {
    const result = originalConvertCursor.call(this, cursor)
    removeSentinelFromBlocks(this.blocks)
    return result
  }

  Object.defineProperty(prototype, PATCH_FLAG, {
    configurable: true,
    value: true
  })
  return true
}

export const installRustEmptyListExitPatch = () => {
  const prototype = StableCompleteMuyaWithRustCore?.prototype
  if (!prototype || prototype[EMPTY_LIST_EXIT_PATCH_FLAG] === true) return false

  const originalEnter = prototype.__enter
  if (typeof originalEnter !== 'function') throw new Error('Muya Enter contract is unavailable')

  prototype.__enter = function(event) {
    if (!event?.shiftKey) {
      const current = this.__selection?.()
      const markdown = String(current?.markdown || '')
      const anchor = current?.selection?.anchor
      const focus = current?.selection?.focus
      if (Number.isInteger(anchor) && anchor === focus) {
        const lineStart = markdown.lastIndexOf('\n', Math.max(0, anchor - 1)) + 1
        const nextBreak = markdown.indexOf('\n', anchor)
        const lineEnd = nextBreak < 0 ? markdown.length : nextBreak
        if (anchor === lineEnd && EMPTY_LIST_ITEM.test(markdown.slice(lineStart, lineEnd))) {
          event?.preventDefault?.()
          event?.stopImmediatePropagation?.()
          return this.__applyRust('empty-list-exit', (engine) => (
            engine.replaceRange(lineStart, lineEnd, '')
          ))
        }
      }
    }
    return originalEnter.call(this, event)
  }

  Object.defineProperty(prototype, EMPTY_LIST_EXIT_PATCH_FLAG, {
    configurable: true,
    value: true
  })
  return true
}

installRustCursorImportPatch()
installRustEmptyListExitPatch()

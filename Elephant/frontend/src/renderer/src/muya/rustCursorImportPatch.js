import ContentState from '../../../muya/lib/contentState'
import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../../../muya/lib/config'

const PATCH_FLAG = '__elephantRustCursorImportPatched'
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

installRustCursorImportPatch()

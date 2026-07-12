import {
  findMatchingSelectionParent,
  importSelection,
  importSelectionMoveCursorPastAnchor,
  importSelectionMoveCursorPastBlocks
} from './importSelection'
import {
  chopHtmlByCursor,
  clearSelection,
  getCaretOffsets,
  getSelectionEnd,
  getSelectionHtml,
  getSelectionRange,
  getSelectionStart,
  select,
  selectNode,
  selectRange,
  setFocus
} from './rangeSelection'
import setDomCursorRange from './setCursorRange'
import getDomCursorRange, { isValidCursorNode } from './getCursorRange'
import {
  getCursorCoords,
  getCursorYOffset
} from './cursorCoords'

class Selection {
  constructor(doc) {
    this.doc = doc
  }

  findMatchingSelectionParent(testElementFunction, contentWindow) {
    return findMatchingSelectionParent(this, testElementFunction, contentWindow)
  }

  importSelection(selectionState, root, favorLaterSelectionAnchor) {
    return importSelection(
      this,
      selectionState,
      root,
      favorLaterSelectionAnchor
    )
  }

  importSelectionMoveCursorPastAnchor(selectionState, range) {
    return importSelectionMoveCursorPastAnchor(this, selectionState, range)
  }

  importSelectionMoveCursorPastBlocks(root, index = 1, range) {
    return importSelectionMoveCursorPastBlocks(this, root, index, range)
  }

  getSelectionHtml() {
    return getSelectionHtml(this)
  }

  chopHtmlByCursor(root) {
    return chopHtmlByCursor(this, root)
  }

  getCaretOffsets(element, range) {
    return getCaretOffsets(this, element, range)
  }

  selectNode(node) {
    return selectNode(this, node)
  }

  select(startNode, startOffset, endNode, endOffset) {
    return select(this, startNode, startOffset, endNode, endOffset)
  }

  setFocus(focusNode, focusOffset) {
    return setFocus(this, focusNode, focusOffset)
  }

  clearSelection(moveCursorToStart) {
    return clearSelection(this, moveCursorToStart)
  }

  moveCursor(node, offset) {
    return this.select(node, offset)
  }

  getSelectionRange() {
    return getSelectionRange(this)
  }

  selectRange(range) {
    return selectRange(this, range)
  }

  getSelectionStart() {
    return getSelectionStart(this)
  }

  setCursorRange(cursorRange) {
    return setDomCursorRange(this, cursorRange)
  }

  isValidCursorNode(node) {
    return isValidCursorNode(node)
  }

  getCursorRange() {
    return getDomCursorRange(this)
  }

  getCursorYOffset(paragraph) {
    return getCursorYOffset(this, paragraph)
  }

  getCursorCoords() {
    return getCursorCoords(this)
  }

  getSelectionEnd() {
    return getSelectionEnd(this)
  }
}

export default new Selection(document)

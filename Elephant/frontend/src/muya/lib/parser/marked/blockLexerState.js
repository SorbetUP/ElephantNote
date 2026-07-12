import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../../config'

export const createBlockLexerState = (
  src,
  top,
  prevListIsOrdered,
  checkCursorSignature
) => ({
  src: src.replace(/^ +$/gm, ''),
  top,
  prevListIsOrdered,
  checkCursorSignature,
  foundAnchorSignature: false,
  foundFocusSignature: false,
  cursorAnchorFocus: ''
})

export const prepareCursorSignature = state => {
  state.cursorAnchorFocus = ''
  if (!state.checkCursorSignature) return

  if (!state.foundAnchorSignature && state.src.startsWith(CURSOR_ANCHOR_DNA)) {
    state.cursorAnchorFocus += CURSOR_ANCHOR_DNA
    state.src = state.src.substring(CURSOR_ANCHOR_DNA.length)
    state.foundAnchorSignature = true
  }
  if (!state.foundFocusSignature && state.src.startsWith(CURSOR_FOCUS_DNA)) {
    state.cursorAnchorFocus += CURSOR_FOCUS_DNA
    state.src = state.src.substring(CURSOR_FOCUS_DNA.length)
    state.foundFocusSignature = true
  }
}

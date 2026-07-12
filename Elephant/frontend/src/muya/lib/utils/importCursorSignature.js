import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../config'

const importCursorSignature = ContentState => {
  ContentState.prototype.addCursorToMarkdown = function(markdown, cursor) {
    const { anchor, focus } = cursor
    if (!anchor || !focus) return

    const lines = markdown.split('\n')
    const isValidLine = line => {
      return Number.isInteger(line) && line >= 0 && line < lines.length
    }
    if (!isValidLine(anchor.line) || !isValidLine(focus.line)) {
      return { markdown: lines.join('\n'), isValid: false }
    }

    const anchorText = lines[anchor.line]
    const focusText = lines[focus.line]
    if (typeof anchorText !== 'string' || typeof focusText !== 'string') {
      return { markdown: lines.join('\n'), isValid: false }
    }

    const getSafeOffset = (offset, text) => {
      return Number.isInteger(offset)
        ? Math.min(Math.max(offset, 0), text.length)
        : 0
    }
    const anchorCh = getSafeOffset(anchor.ch, anchorText)
    const focusCh = getSafeOffset(focus.ch, focusText)

    if (anchor.line === focus.line) {
      const minOffset = Math.min(anchorCh, focusCh)
      const maxOffset = Math.max(anchorCh, focusCh)
      lines[anchor.line] =
        anchorText.substring(0, minOffset) +
        (anchorCh <= focusCh ? CURSOR_ANCHOR_DNA : CURSOR_FOCUS_DNA) +
        anchorText.substring(minOffset, maxOffset) +
        (anchorCh <= focusCh ? CURSOR_FOCUS_DNA : CURSOR_ANCHOR_DNA) +
        anchorText.substring(maxOffset)
    } else {
      lines[anchor.line] =
        anchorText.substring(0, anchorCh) +
        CURSOR_ANCHOR_DNA +
        anchorText.substring(anchorCh)
      lines[focus.line] =
        focusText.substring(0, focusCh) +
        CURSOR_FOCUS_DNA +
        focusText.substring(focusCh)
    }

    return { markdown: lines.join('\n'), isValid: true }
  }

  ContentState.prototype.convertMuyaIndexCursortoCursor = function(
    muyaIndexCursor
  ) {
    if (!muyaIndexCursor?.anchor || !muyaIndexCursor?.focus) return null
    const cursor = { anchor: null, focus: null }
    let count = 0

    const travel = blocks => {
      for (const block of blocks) {
        let { key, text, children, editable } = block
        if (text) {
          const anchorOffset = text.indexOf(CURSOR_ANCHOR_DNA)
          if (anchorOffset > -1) {
            block.text =
              text.substring(0, anchorOffset) +
              text.substring(anchorOffset + CURSOR_ANCHOR_DNA.length)
            text = block.text
            count++
            if (editable) cursor.anchor = { key, offset: anchorOffset }
          }
          const focusOffset = text.indexOf(CURSOR_FOCUS_DNA)
          if (focusOffset > -1) {
            block.text =
              text.substring(0, focusOffset) +
              text.substring(focusOffset + CURSOR_FOCUS_DNA.length)
            count++
            if (editable) cursor.focus = { key, offset: focusOffset }
          }
          if (count === 2) break
        } else if (children.length) {
          travel(children)
        }
      }
    }
    travel(this.blocks)

    if (cursor.anchor && cursor.focus) {
      const anchorFirst =
        muyaIndexCursor.anchor.line < muyaIndexCursor.focus.line ||
        (muyaIndexCursor.anchor.line === muyaIndexCursor.focus.line &&
          muyaIndexCursor.anchor.ch <= muyaIndexCursor.focus.ch)
      cursor.start = anchorFirst ? cursor.anchor : cursor.focus
      cursor.end = anchorFirst ? cursor.focus : cursor.anchor
    }
    return cursor
  }

  ContentState.prototype.importCursor = function(cursor) {
    if (!cursor?.anchor || !cursor?.focus) {
      cursor = {}
      const firstBlock = this.getFirstBlock()
      const key = firstBlock.key
      const offset = firstBlock.text.length
      cursor.anchor = { key, offset }
      cursor.focus = { key, offset }
      cursor.start = { key, offset }
      cursor.end = { key, offset }
    } else if (!cursor.start || !cursor.end) {
      cursor.start = cursor.anchor
      cursor.end = cursor.focus
    }
    this.cursor = { ...cursor, isInit: true }
  }
}

export default importCursorSignature

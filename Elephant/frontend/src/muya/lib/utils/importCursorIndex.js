import ExportMarkdown from './exportMarkdown'
import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../config'

const importCursorIndex = ContentState => {
  ContentState.prototype.getMuyaIndexCursor = function() {
    const blocks = this.getBlocks()
    const { anchor, focus } = this.cursor
    const anchorBlock = this.getBlock(anchor.key)
    const focusBlock = this.getBlock(focus.key)
    if (!anchorBlock || !focusBlock) {
      console.warn('Can not find anchor block or focus block in getMuyaIndexCursor')
      return null
    }

    const { text: anchorText } = anchorBlock
    const { text: focusText } = focusBlock
    if (anchor.key === focus.key) {
      const minOffset = Math.min(anchor.offset, focus.offset)
      const maxOffset = Math.max(anchor.offset, focus.offset)
      anchorBlock.text =
        anchorText.substring(0, minOffset) +
        (anchor.offset <= focus.offset ? CURSOR_ANCHOR_DNA : CURSOR_FOCUS_DNA) +
        anchorText.substring(minOffset, maxOffset) +
        (anchor.offset <= focus.offset ? CURSOR_FOCUS_DNA : CURSOR_ANCHOR_DNA) +
        anchorText.substring(maxOffset)
    } else {
      anchorBlock.text =
        anchorText.substring(0, anchor.offset) +
        CURSOR_ANCHOR_DNA +
        anchorText.substring(anchor.offset)
      focusBlock.text =
        focusText.substring(0, focus.offset) +
        CURSOR_FOCUS_DNA +
        focusText.substring(focus.offset)
    }

    const markdown = new ExportMarkdown(
      blocks,
      this.listIndentation,
      this.isGitlabCompatibilityEnabled
    ).generate()
    const cursor = markdown.split('\n').reduce(
      (result, line, index) => {
        const anchorCh = line.indexOf(CURSOR_ANCHOR_DNA)
        const focusCh = line.indexOf(CURSOR_FOCUS_DNA)
        if (anchorCh > -1 && focusCh > -1) {
          if (anchorCh <= focusCh) {
            Object.assign(result.anchor, { line: index, ch: anchorCh })
            Object.assign(result.focus, {
              line: index,
              ch: focusCh - CURSOR_ANCHOR_DNA.length
            })
          } else {
            Object.assign(result.focus, { line: index, ch: focusCh })
            Object.assign(result.anchor, {
              line: index,
              ch: anchorCh - CURSOR_FOCUS_DNA.length
            })
          }
        } else if (anchorCh > -1) {
          Object.assign(result.anchor, { line: index, ch: anchorCh })
        } else if (focusCh > -1) {
          Object.assign(result.focus, { line: index, ch: focusCh })
        }
        return result
      },
      {
        anchor: { line: 0, ch: 0 },
        focus: { line: 0, ch: 0 }
      }
    )

    anchorBlock.text = anchorText
    focusBlock.text = focusText
    return cursor
  }
}

export default importCursorIndex

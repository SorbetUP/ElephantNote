import selection from '../selection'
import { tokenizer, generator } from '../parser/'
import { clearFormat, isInlineFormatToken } from './formatHelpers'

const formatSelectionState = ContentState => {
  ContentState.prototype.selectionFormats = function(
    { start, end } = selection.getCursorRange()
  ) {
    if (!start || !end) return { formats: [], tokens: [], neighbors: [] }

    const startBlock = this.getBlock(start.key)
    const formats = []
    const neighbors = []
    let tokens = []
    if (start.key === end.key) {
      tokens = tokenizer(startBlock.text, { options: this.muya.options })
      ;(function iterator(items) {
        for (const token of items) {
          if (
            isInlineFormatToken(token) &&
            start.offset >= token.range.start &&
            end.offset <= token.range.end
          ) {
            formats.push(token)
          }
          if (
            isInlineFormatToken(token) &&
            ((start.offset >= token.range.start && start.offset <= token.range.end) ||
              (end.offset >= token.range.start && end.offset <= token.range.end) ||
              (start.offset <= token.range.start && token.range.end <= end.offset))
          ) {
            neighbors.push(token)
          }
          if (token.children && token.children.length) iterator(token.children)
        }
      })(tokens)
    }
    return { formats, tokens, neighbors }
  }

  ContentState.prototype.clearBlockFormat = function(
    block,
    { start, end } = selection.getCursorRange(),
    type
  ) {
    if (!start || !end) return
    if (block.type === 'pre') return false

    const { key } = block
    let tokens
    let neighbors
    if (start.key === end.key && start.key === key) {
      ;({ tokens, neighbors } = this.selectionFormats({ start, end }))
    } else if (start.key !== end.key && start.key === key) {
      ;({ tokens, neighbors } = this.selectionFormats({
        start,
        end: { key: start.key, offset: block.text.length }
      }))
    } else if (start.key !== end.key && end.key === key) {
      ;({ tokens, neighbors } = this.selectionFormats({
        start: { key: end.key, offset: 0 },
        end
      }))
    } else {
      ;({ tokens, neighbors } = this.selectionFormats({
        start: { key, offset: 0 },
        end: { key, offset: block.text.length }
      }))
    }

    neighbors = type
      ? neighbors.filter(n => n.type === type || (n.type === 'html_tag' && n.tag === type))
      : neighbors

    for (const neighbor of neighbors) clearFormat(neighbor, { start, end })
    start.offset += start.delata
    end.offset += end.delata
    block.text = generator(tokens)
  }
}

export default formatSelectionState

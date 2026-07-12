import { EVENT_KEYS } from '../config'

export const adjustArrowOffset = (offset, block, event) => {
  if (block.type === 'span' && block.functionType === 'atxLine' && event.key === EVENT_KEYS.ArrowDown) {
    const match = /^\s{0,3}(?:#{1,6})(?:\s{1,}|$)/.exec(block.text)
    if (match) return match[0].length
  }
  return offset
}

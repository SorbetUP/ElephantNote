import { defaultSearchOption } from '../config'
import { matchString } from './searchMatcher'

export function search(value, opt = {}) {
  const matches = []
  const options = Object.assign({}, defaultSearchOption, opt)
  const { highlightIndex } = options
  const travel = blocks => {
    for (const block of blocks) {
      const { text, key } = block
      if (text && typeof text === 'string') {
        const strMatches = matchString(text, value, options)
        matches.push(...strMatches.map(({ index, match, subMatches }) => ({
          key,
          start: index,
          end: index + match.length,
          match,
          subMatches
        })))
      }
      if (block.children.length) travel(block.children)
    }
  }
  if (value) travel(this.blocks)
  let index = -1
  if (highlightIndex !== -1) index = highlightIndex
  else if (matches.length) index = 0
  Object.assign(this.searchMatches, { value, matches, index })
  if (value) this.setCursorToHighlight()
  return matches
}

import { defaultSearchOption } from '../config'

export function buildRegexValue(match, value) {
  const groups = value.match(/(?<!\\)\$\d/g)
  if (Array.isArray(groups) && groups.length) {
    for (const group of groups) {
      const index = parseInt(group.replace(/^\$/, ''))
      if (index === 0) value = value.replace(group, match.match)
      else if (index > 0 && index <= match.subMatches.length) {
        value = value.replace(group, match.subMatches[index - 1])
      }
    }
  }
  return value
}

export function replaceOne(match, value) {
  const { start, end, key } = match
  const block = this.getBlock(key)
  const { text } = block
  block.text = text.substring(0, start) + value + text.substring(end)
}

export function replace(replaceValue, opt = { isSingle: true }) {
  const { isSingle, isRegexp } = opt
  delete opt.isSingle
  const searchOptions = Object.assign({}, defaultSearchOption, opt)
  const { matches, value, index } = this.searchMatches
  if (!matches.length) return
  if (isRegexp) replaceValue = this.buildRegexValue(matches[index], replaceValue)
  if (isSingle) this.replaceOne(matches[index], replaceValue)
  else for (const match of matches) this.replaceOne(match, replaceValue)
  const highlightIndex = index < matches.length - 1 ? index : index - 1
  this.search(value, {
    ...searchOptions,
    highlightIndex: isSingle ? highlightIndex : -1
  })
}

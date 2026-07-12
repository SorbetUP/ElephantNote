export const rtrim = function rtrim(value, character, invert) {
  if (value.length === 0) return ''

  let suffixLength = 0
  while (suffixLength < value.length) {
    const current = value.charAt(value.length - suffixLength - 1)
    if (current === character && !invert) {
      suffixLength += 1
    } else if (current !== character && invert) {
      suffixLength += 1
    } else {
      break
    }
  }
  return value.substr(0, value.length - suffixLength)
}

export const findClosingBracket = function findClosingBracket(value, brackets) {
  if (value.indexOf(brackets[1]) === -1) return -1
  let level = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
    } else if (value[index] === brackets[0]) {
      level += 1
    } else if (value[index] === brackets[1]) {
      level -= 1
      if (level < 0) return index
    }
  }
  return -1
}

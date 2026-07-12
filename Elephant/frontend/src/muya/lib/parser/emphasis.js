import { PUNCTUATION_REG } from './punctuation'

const UNICODE_WHITESPACE_REG = /^\s/

export const lowerPriority = (src, offset, rules) => {
  const ignoreIndex = []
  for (let i = 0; i < offset; i++) {
    if (ignoreIndex.includes(i)) continue
    const text = src.substring(i)
    for (const rule of Object.keys(rules)) {
      const to = rules[rule].exec(text)
      if (to && to[0].length <= offset - i) ignoreIndex.push(i + to[0].length - 1)
      if (to && to[0].length > offset - i) return false
    }
  }
  return true
}

const canOpenEmphasis = (src, marker, pending) => {
  const precededChar = pending.charAt(pending.length - 1) || '\n'
  const followedChar = src[marker.length]
  if (UNICODE_WHITESPACE_REG.test(followedChar)) return false
  if (PUNCTUATION_REG.test(followedChar) &&
      !(UNICODE_WHITESPACE_REG.test(precededChar) || PUNCTUATION_REG.test(precededChar))) return false
  if (/_/.test(marker) &&
      !(UNICODE_WHITESPACE_REG.test(precededChar) || PUNCTUATION_REG.test(precededChar))) return false
  return true
}

const canCloseEmphasis = (src, offset, marker) => {
  const precededChar = src[offset - marker.length - 1]
  const followedChar = src[offset] || '\n'
  if (UNICODE_WHITESPACE_REG.test(precededChar)) return false
  if (PUNCTUATION_REG.test(precededChar) &&
      !(UNICODE_WHITESPACE_REG.test(followedChar) || PUNCTUATION_REG.test(followedChar))) return false
  if (/_/.test(marker) &&
      !(UNICODE_WHITESPACE_REG.test(followedChar) || PUNCTUATION_REG.test(followedChar))) return false
  return true
}

export const validateEmphasize = (src, offset, marker, pending, rules) => {
  if (!canOpenEmphasis(src, marker, pending) || !canCloseEmphasis(src, offset, marker)) return false
  const mLen = marker.length
  const emphasizeText = src.substring(mLen, offset - mLen)
  const shorterReg = new RegExp(` \\${marker.split('').join('\\')}[^\\${marker.charAt(0)}]`)
  const closeReg = new RegExp(`[^\\${marker.charAt(0)}]\\${marker.split('').join('\\')}`)
  if (emphasizeText.match(shorterReg) && !emphasizeText.match(closeReg)) return false
  return lowerPriority(src, offset, rules)
}

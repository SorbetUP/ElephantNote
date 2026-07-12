import { HTML_TAGS, VOID_HTML_TAGS } from '../config'

export const parseSelector = (str = '') => {
  const REG_EXP = /(#|\.)([^#.]+)/
  let tag = ''
  let id = ''
  let className = ''
  let isVoid = false
  let cap
  for (const tagName of HTML_TAGS) {
    if (str.startsWith(tagName) && (!str[tagName.length] || /#|\./.test(str[tagName.length]))) {
      tag = tagName
      if (VOID_HTML_TAGS.indexOf(tagName) > -1) isVoid = true
      str = str.substring(tagName.length)
    }
  }
  if (tag !== '') {
    cap = REG_EXP.exec(str)
    while (cap && str.length) {
      if (cap[1] === '#') id = cap[2]
      else className = cap[2]
      str = str.substring(cap[0].length)
      cap = REG_EXP.exec(str)
    }
  }
  return { tag, id, className, isVoid }
}

export const completeHtmlSelector = (block, cursor) => {
  const { text } = block
  const lastWordBeforeCursor = text.substring(0, cursor.start.offset).split(/\s+/).pop()
  const { tag, isVoid, id, className } = parseSelector(lastWordBeforeCursor)
  if (!tag) return null

  const preText = text.substring(0, cursor.start.offset - lastWordBeforeCursor.length)
  const postText = text.substring(cursor.end.offset)
  let html = `<${tag}`
  let startOffset = 0
  let endOffset = 0
  switch (tag) {
    case 'img':
      html += ' alt="" src=""'
      startOffset = endOffset = html.length - 1
      break
    case 'input':
      html += ' type="text"'
      startOffset = html.length - 5
      endOffset = html.length - 1
      break
    case 'a':
      html += ' href=""'
      startOffset = endOffset = html.length - 1
      break
    case 'link':
      html += ' rel="stylesheet" href=""'
      startOffset = endOffset = html.length - 1
      break
  }
  if (id) html += ` id="${id}"`
  if (className) html += ` class="${className}"`
  html += '>'
  if (startOffset === 0 && endOffset === 0) startOffset = endOffset = html.length
  if (!isVoid) html += `</${tag}>`
  return {
    text: preText + html + postText,
    startOffset: startOffset + preText.length,
    endOffset: endOffset + preText.length
  }
}

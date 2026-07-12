import { getFormatOffset } from './formatOffset'

export const clearFormat = (token, { start, end }) => {
  if (start) start.delata += getFormatOffset(start.offset, token)
  if (end) end.delata += getFormatOffset(end.offset, token)
  switch (token.type) {
    case 'strong':
    case 'del':
    case 'em':
    case 'link':
    case 'html_tag': {
      const { parent } = token
      const index = parent.indexOf(token)
      parent.splice(index, 1, ...token.children)
      break
    }
    case 'image':
      token.type = 'text'
      token.raw = token.alt
      delete token.marker
      delete token.src
      break
    case 'inline_math':
    case 'inline_code':
      token.type = 'text'
      token.raw = token.content
      delete token.marker
      break
  }
}

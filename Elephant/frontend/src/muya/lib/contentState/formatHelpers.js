import { FORMAT_MARKER_MAP, FORMAT_TYPES } from '../config'

const getOffset = (offset, { range: { start, end }, type, tag, anchor, alt }) => {
  const dis = offset - start
  const len = end - start
  switch (type) {
    case 'strong':
    case 'del':
    case 'em':
    case 'inline_code':
    case 'inline_math': {
      const markerLength = type === 'strong' || type === 'del' ? 2 : 1
      if (dis < 0) return 0
      if (dis >= 0 && dis < markerLength) return -dis
      if (dis >= markerLength && dis <= len - markerLength) return -markerLength
      if (dis > len - markerLength && dis <= len) return len - dis - 2 * markerLength
      if (dis > len) return -2 * markerLength
      break
    }
    case 'html_tag': {
      const openLength = FORMAT_MARKER_MAP[tag].open.length
      const closeLength = FORMAT_MARKER_MAP[tag].close.length
      if (dis < 0) return 0
      if (dis >= 0 && dis < openLength) return -dis
      if (dis >= openLength && dis <= len - closeLength) return -openLength
      if (dis > len - closeLength && dis <= len) {
        return len - dis - openLength - closeLength
      }
      if (dis > len) return -openLength - closeLength
      break
    }
    case 'link': {
      const markerLength = 1
      if (dis < markerLength) return 0
      if (dis >= markerLength && dis <= markerLength + anchor.length) return -1
      if (dis > markerLength + anchor.length) return anchor.length - dis
      break
    }
    case 'image': {
      const markerLength = 1
      if (dis < markerLength) return 0
      if (dis >= markerLength && dis < markerLength * 2) return -1
      if (dis >= markerLength * 2 && dis <= markerLength * 2 + alt.length) return -2
      if (dis > markerLength * 2 + alt.length) return alt.length - dis
      break
    }
  }
}

export const clearFormat = (token, { start, end }) => {
  if (start) start.delata += getOffset(start.offset, token)
  if (end) end.delata += getOffset(end.offset, token)
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

export const addFormat = (type, block, { start, end }) => {
  if (
    block.type !== 'span' ||
    (block.type === 'span' && !/paragraphContent|cellContent|atxLine/.test(block.functionType))
  ) {
    return false
  }
  switch (type) {
    case 'em':
    case 'del':
    case 'inline_code':
    case 'strong':
    case 'inline_math': {
      const marker = FORMAT_MARKER_MAP[type]
      const oldText = block.text
      block.text =
        oldText.substring(0, start.offset) +
        marker +
        oldText.substring(start.offset, end.offset) +
        marker +
        oldText.substring(end.offset)
      start.offset += marker.length
      end.offset += marker.length
      break
    }
    case 'sub':
    case 'sup':
    case 'mark':
    case 'u': {
      const marker = FORMAT_MARKER_MAP[type]
      const oldText = block.text
      block.text =
        oldText.substring(0, start.offset) +
        marker.open +
        oldText.substring(start.offset, end.offset) +
        marker.close +
        oldText.substring(end.offset)
      start.offset += marker.open.length
      end.offset += marker.open.length
      break
    }
    case 'link':
    case 'image': {
      const oldText = block.text
      const anchorTextLen = end.offset - start.offset
      block.text =
        oldText.substring(0, start.offset) +
        (type === 'link' ? '[' : '![') +
        oldText.substring(start.offset, end.offset) +
        ']()' +
        oldText.substring(end.offset)
      start.offset += type === 'link' ? 3 + anchorTextLen : 4 + anchorTextLen
      end.offset = start.offset
      break
    }
  }
}

export const isInlineFormatToken = token => {
  const { type, tag } = token
  if (FORMAT_TYPES.includes(type)) return true
  return type === 'html_tag' && /^(?:u|sub|sup|mark)$/i.test(tag)
}

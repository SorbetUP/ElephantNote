import { FORMAT_MARKER_MAP } from '../config'

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

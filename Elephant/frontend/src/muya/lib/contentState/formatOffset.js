import { FORMAT_MARKER_MAP } from '../config'

export const getFormatOffset = (
  offset,
  { range: { start, end }, type, tag, anchor, alt }
) => {
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

import { URL_REG, DATA_URL_REG } from '../config'

export function insertImage({ alt = '', src = '', title = '' }) {
  const match = /(?:\/|\\)?([^./\\]+)\.[a-z]+$/.exec(src)
  if (!alt) {
    alt = match && match[1] ? match[1] : ''
  }

  const { start, end } = this.cursor
  const { formats } = this.selectionFormats({ start, end })
  const { key, offset: startOffset } = start
  const { offset: endOffset } = end
  const block = this.getBlock(key)
  if (
    block.type === 'span' &&
    (block.functionType === 'codeContent' ||
      block.functionType === 'languageInput' ||
      block.functionType === 'thematicBreakLine')
  ) {
    return
  }
  const { text } = block
  const imageFormat = formats.filter((format) => format.type === 'image')
  let imgUrl
  if (URL_REG.test(src)) {
    imgUrl = encodeURI(src)
  } else if (DATA_URL_REG.test(src)) {
    imgUrl = src
  } else {
    imgUrl = src.replace(/ /g, encodeURI(' ')).replace(/#/g, encodeURIComponent('#'))
  }

  let srcAndTitle = imgUrl
  if (srcAndTitle && title) srcAndTitle += ` "${title}"`

  if (
    imageFormat.length === 1 &&
    imageFormat[0].range.start !== startOffset &&
    imageFormat[0].range.end !== endOffset
  ) {
    let imageAlt = alt
    if (imageFormat[0].alt && !imageFormat[0].src) imageAlt = imageFormat[0].alt
    const { start: imageStart, end: imageEnd } = imageFormat[0].range
    block.text =
      text.substring(0, imageStart) +
      `![${imageAlt}](${srcAndTitle})` +
      text.substring(imageEnd)
    this.cursor = {
      start: { key, offset: imageStart + 2 },
      end: { key, offset: imageStart + 2 + imageAlt.length },
      isEdit: true
    }
  } else if (key !== end.key) {
    const endBlock = this.getBlock(end.key)
    const { text: endText } = endBlock
    endBlock.text =
      endText.substring(0, endOffset) +
      `![${alt}](${srcAndTitle})` +
      endText.substring(endOffset)
    const offset = endOffset + 2
    this.cursor = {
      start: { key: end.key, offset },
      end: { key: end.key, offset: offset + alt.length },
      isEdit: true
    }
  } else {
    const imageAlt = startOffset !== endOffset ? text.substring(startOffset, endOffset) : alt
    block.text =
      text.substring(0, start.offset) +
      `![${imageAlt}](${srcAndTitle})` +
      text.substring(end.offset)
    this.cursor = {
      start: { key, offset: startOffset + 2 },
      end: { key, offset: startOffset + 2 + imageAlt.length },
      isEdit: true
    }
  }
  this.partialRender()
  this.muya.dispatchChange()
}

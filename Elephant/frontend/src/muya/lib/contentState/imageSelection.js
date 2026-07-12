const toFilePath = (pathname) => {
  if (!pathname) return ''
  if (!String(pathname).startsWith('file://')) return pathname
  try {
    const url = new URL(pathname)
    return decodeURIComponent(url.pathname)
  } catch {
    return pathname.replace(/^file:\/\//, '')
  }
}

export function selectImage(imageInfo) {
  this.selectedImage = imageInfo
  const { key } = imageInfo
  const block = this.getBlock(key)
  const outMostBlock = this.findOutMostBlock(block)
  this.cursor = {
    start: { key, offset: imageInfo.token.range.end },
    end: { key, offset: imageInfo.token.range.end },
    isEdit: false
  }
  const { start } = this.prevCursor
  const oldBlock = this.findOutMostBlock(this.getBlock(start.key))
  if (oldBlock.key !== outMostBlock.key) {
    this.singleRender(oldBlock, false)
  }
  return this.singleRender(outMostBlock, true)
}

export function openImage({ key, absoluteImagePath }) {
  if (!absoluteImagePath) return
  const block = this.getBlock(key)
  const { eventCenter } = this.muya
  if (this.muya.options.openImageWithExternalTool) {
    const path = toFilePath(absoluteImagePath)
    this.muya.options.openImageWithExternalTool(path)
    this.singleRender(block)
    eventCenter.dispatch('muya-transformer', { reference: null })
    eventCenter.dispatch('muya-image-toolbar', { reference: null })
    this.muya.dispatchChange()
  }
}

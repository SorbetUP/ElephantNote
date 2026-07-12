export const dragoverHandler = function(event) {
  if (!event.dataTransfer.types.length) {
    event.dataTransfer.dropEffect = 'none'
    return
  }

  if (event.dataTransfer.types.includes('text/uri-list')) {
    const items = Array.from(event.dataTransfer.items)
    const hasUriItem = items.some(item => item.type === 'text/uri-list')
    const hasTextItem = items.some(item => item.type === 'text/plain')
    const hasHtmlItem = items.some(item => item.type === 'text/html')
    if (hasUriItem && hasHtmlItem && !hasTextItem) {
      this.createGhost(event)
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  if (event.dataTransfer.types.indexOf('Files') >= 0) {
    if (event.dataTransfer.items.length === 1 && event.dataTransfer.items[0].type.indexOf('image') > -1) {
      event.preventDefault()
      this.createGhost(event)
      event.dataTransfer.dropEffect = 'copy'
    }
  } else {
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'none'
  }
}

export const dragleaveHandler = function(event) {
  return this.hideGhost()
}

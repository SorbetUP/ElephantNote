export const listenTransformer = transformer => {
  const { eventCenter, container } = transformer.muya
  const scrollHandler = event => {
    if (typeof transformer.lastScrollTop !== 'number') {
      transformer.lastScrollTop = event.target.scrollTop
      return
    }
    if (
      !transformer.resizing &&
      transformer.status &&
      Math.abs(event.target.scrollTop - transformer.lastScrollTop) > 50
    ) {
      transformer.hide()
    }
  }

  eventCenter.attachDOMEvent(document, 'click', transformer.hide.bind(transformer))
  eventCenter.subscribe('muya-transformer', ({ reference, imageInfo }) => {
    transformer.reference = reference
    if (reference) {
      transformer.imageInfo = imageInfo
      setTimeout(() => transformer.render())
    } else {
      transformer.hide()
    }
  })
  eventCenter.attachDOMEvent(container, 'scroll', scrollHandler)
  eventCenter.attachDOMEvent(
    transformer.container,
    'dragstart',
    event => event.preventDefault()
  )
  eventCenter.attachDOMEvent(document.body, 'mousedown', transformer.mouseDown)
}

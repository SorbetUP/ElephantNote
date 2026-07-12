import { CIRCLE_RADIO } from './elements'

export const startTransformerResize = (transformer, event) => {
  const target = event.target
  if (!target.closest('.circle')) return
  const { eventCenter } = transformer.muya
  transformer.movingAnchor = target.getAttribute('data-position')
  const mouseMoveId = eventCenter.attachDOMEvent(
    document.body,
    'mousemove',
    transformer.mouseMove
  )
  const mouseUpId = eventCenter.attachDOMEvent(
    document.body,
    'mouseup',
    transformer.mouseUp
  )
  transformer.resizing = true
  eventCenter.dispatch('muya-image-toolbar', { reference: null })
  transformer.eventId.push(mouseMoveId, mouseUpId)
}

export const moveTransformerResize = (transformer, event) => {
  const clientX = event.clientX
  let width
  let relativeAnchor
  const image = transformer.reference.querySelector('img')
  if (!image) return

  switch (transformer.movingAnchor) {
    case 'top-left':
    case 'bottom-left':
      relativeAnchor = transformer.container.querySelector('.top-right')
      width = Math.max(
        relativeAnchor.getBoundingClientRect().left + CIRCLE_RADIO - clientX,
        50
      )
      break
    case 'top-right':
    case 'bottom-right':
      relativeAnchor = transformer.container.querySelector('.top-left')
      width = Math.max(
        clientX - relativeAnchor.getBoundingClientRect().left - CIRCLE_RADIO,
        50
      )
      break
  }
  width = parseInt(width)
  transformer.width = width
  image.setAttribute('width', width)
  transformer.update()
}

export const finishTransformerResize = transformer => {
  const { eventCenter } = transformer.muya
  if (transformer.eventId.length) {
    for (const id of transformer.eventId) eventCenter.detachDOMEvent(id)
    transformer.eventId = []
  }
  if (typeof transformer.width === 'number') {
    transformer.muya.contentState.updateImage(
      transformer.imageInfo,
      'width',
      transformer.width
    )
    transformer.width = null
    transformer.hide()
  }
  transformer.resizing = false
  transformer.movingAnchor = null
}

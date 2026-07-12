export const getParagraphReference = (element, id) => {
  const { x, y, left, top, bottom, height } = element.getBoundingClientRect()
  return {
    getBoundingClientRect() {
      return { x, y, left, top, bottom, height, width: 0, right: left }
    },
    clientWidth: 0,
    clientHeight: height,
    id
  }
}

export const verticalPositionInRect = (event, rect) => {
  const { clientY } = event
  const { top, height } = rect
  return clientY - top > height / 2 ? 'down' : 'up'
}

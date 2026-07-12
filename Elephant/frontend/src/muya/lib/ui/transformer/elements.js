export const CIRCLES = Object.freeze([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
])

export const CIRCLE_RADIO = 6

export const createTransformerElements = transformer => {
  CIRCLES.forEach(position => {
    const circle = document.createElement('div')
    circle.classList.add('circle')
    circle.classList.add(position)
    circle.setAttribute('data-position', position)
    transformer.container.appendChild(circle)
  })
}

export const updateTransformerElements = transformer => {
  const rect = transformer.reference.getBoundingClientRect()
  CIRCLES.forEach(position => {
    const circle = transformer.container.querySelector(`.${position}`)
    switch (position) {
      case 'top-left':
        circle.style.left = `${rect.left - CIRCLE_RADIO}px`
        circle.style.top = `${rect.top - CIRCLE_RADIO}px`
        break
      case 'top-right':
        circle.style.left = `${rect.left + rect.width - CIRCLE_RADIO}px`
        circle.style.top = `${rect.top - CIRCLE_RADIO}px`
        break
      case 'bottom-left':
        circle.style.left = `${rect.left - CIRCLE_RADIO}px`
        circle.style.top = `${rect.top + rect.height - CIRCLE_RADIO}px`
        break
      case 'bottom-right':
        circle.style.left = `${rect.left + rect.width - CIRCLE_RADIO}px`
        circle.style.top = `${rect.top + rect.height - CIRCLE_RADIO}px`
        break
    }
  })
}

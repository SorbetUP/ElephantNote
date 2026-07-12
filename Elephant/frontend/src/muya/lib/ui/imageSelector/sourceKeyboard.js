import { EVENT_KEYS } from '../../config'

export const handleSourceKeyDown = (selector, event) => {
  const { imagePathPicker } = selector.muya
  if (!imagePathPicker.status) {
    if (event.key === EVENT_KEYS.Enter) {
      event.stopPropagation()
      selector.handleLinkButtonClick()
    }
    return
  }
  switch (event.key) {
    case EVENT_KEYS.ArrowUp:
      event.preventDefault()
      imagePathPicker.step('previous')
      break
    case EVENT_KEYS.ArrowDown:
    case EVENT_KEYS.Tab:
      event.preventDefault()
      imagePathPicker.step('next')
      break
    case EVENT_KEYS.Enter:
      event.preventDefault()
      imagePathPicker.selectItem(imagePathPicker.activeItem)
      break
  }
}

export const handleSourceKeyUp = async(selector, event) => {
  const { key } = event
  if (
    key === EVENT_KEYS.ArrowUp ||
    key === EVENT_KEYS.ArrowDown ||
    key === EVENT_KEYS.Tab ||
    (key === EVENT_KEYS.Enter &&
      !selector.state.src.endsWith('/') &&
      !selector.state.src.endsWith('\\'))
  ) {
    return
  }

  const value = EVENT_KEYS.Enter ? selector.state.src : event.target.value
  const { eventCenter } = selector.muya
  const reference = selector.imageSelectorContainer.querySelector('input.src')
  const cb = item => {
    const { text } = item
    let basePath = ''
    const pathSep = value.match(/(\/|\\)(?:[^/\\]*)$/)
    if (pathSep && pathSep[0]) basePath = value.substring(0, pathSep.index + 1)
    const newValue = basePath + text
    const len = newValue.length
    reference.value = newValue
    selector.state.src = newValue
    reference.focus()
    reference.setSelectionRange(len, len)
  }
  const list = value
    ? await selector.muya.options.imagePathAutoComplete(value)
    : []
  eventCenter.dispatch('muya-image-picker', { reference, list, cb })
}

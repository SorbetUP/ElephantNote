import { EVENT_KEYS, URL_REG, isWin } from '../../config'
import { getUniqueId, getImageInfo as getImageSrc } from '../../utils'
import { getImageInfo } from '../../utils/getImageInfo'

export const listenImageSelector = selector => {
  selector.muya.eventCenter.subscribe(
    'muya-image-selector',
    ({ reference, cb, imageInfo }) => {
      if (!reference) return selector.hide()

      const { contentState } = selector.muya
      if (contentState.selectedImage) contentState.selectedImage = null
      Object.assign(selector.state, imageInfo.token.attrs)
      selector.imageInfo = imageInfo
      const imageSrc = selector.state.src
      if (imageSrc && /^file:\/\//.test(imageSrc)) {
        let protocolLen = 7
        if (isWin && /^file:\/\/\//.test(imageSrc)) protocolLen = 8
        selector.state.src = imageSrc.substring(protocolLen)
      }
      selector.show(reference, cb)
      selector.render()
      const input = selector.imageSelectorContainer.querySelector('input.src')
      if (input) {
        input.value = selector.state.src
        input.focus()
        if (typeof input.select === 'function') input.select()
      }
    }
  )
}

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
  const list = value ? await selector.muya.options.imagePathAutoComplete(value) : []
  eventCenter.dispatch('muya-image-picker', { reference, list, cb })
}

export const replaceImageAsync = async(selector, { alt, src, title }) => {
  if (!selector.muya.options.imageAction || URL_REG.test(src)) {
    const { alt: oldAlt, src: oldSrc, title: oldTitle } = selector.imageInfo.token.attrs
    if (alt !== oldAlt || src !== oldSrc || title !== oldTitle) {
      selector.muya.contentState.replaceImage(selector.imageInfo, { alt, src, title })
    }
    selector.hide()
  } else if (src) {
    const id = `loading-${getUniqueId()}`
    selector.muya.contentState.replaceImage(selector.imageInfo, { alt: id, src, title })
    selector.hide()
    try {
      const newSrc = await selector.muya.options.imageAction(src, id, alt)
      const { src: localPath } = getImageSrc(src)
      if (localPath) selector.muya.contentState.stateRender.urlMap.set(newSrc, localPath)
      const imageWrapper = selector.muya.container.querySelector(`span[data-id=${id}]`)
      if (imageWrapper) {
        const imageInfo = getImageInfo(imageWrapper)
        selector.muya.contentState.replaceImage(imageInfo, { alt, src: newSrc, title })
      }
    } catch (error) {
      console.error('Unexpected error on image action:', error)
    }
  } else {
    selector.hide()
  }
  selector.muya.eventCenter.dispatch('stateChange')
}

export const chooseImage = async selector => {
  if (!selector.muya.options.imagePathPicker) {
    console.warn('You need to add a imagePathPicker option')
    return
  }
  const path = await selector.muya.options.imagePathPicker()
  const { alt, title } = selector.state
  return selector.replaceImageAsync({ alt, title, src: path })
}

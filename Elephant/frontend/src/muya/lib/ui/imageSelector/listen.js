import { isWin } from '../../config'

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

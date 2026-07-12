import { URL_REG } from '../../config'
import { getUniqueId, getImageInfo as getImageSrc } from '../../utils'
import { getImageInfo } from '../../utils/getImageInfo'

export const replaceImageAsync = async(selector, { alt, src, title }) => {
  if (!selector.muya.options.imageAction || URL_REG.test(src)) {
    const {
      alt: oldAlt,
      src: oldSrc,
      title: oldTitle
    } = selector.imageInfo.token.attrs
    if (alt !== oldAlt || src !== oldSrc || title !== oldTitle) {
      selector.muya.contentState.replaceImage(
        selector.imageInfo,
        { alt, src, title }
      )
    }
    selector.hide()
  } else if (src) {
    const id = `loading-${getUniqueId()}`
    selector.muya.contentState.replaceImage(
      selector.imageInfo,
      { alt: id, src, title }
    )
    selector.hide()
    try {
      const newSrc = await selector.muya.options.imageAction(src, id, alt)
      const { src: localPath } = getImageSrc(src)
      if (localPath) {
        selector.muya.contentState.stateRender.urlMap.set(newSrc, localPath)
      }
      const imageWrapper = selector.muya.container.querySelector(
        `span[data-id=${id}]`
      )
      if (imageWrapper) {
        const imageInfo = getImageInfo(imageWrapper)
        selector.muya.contentState.replaceImage(
          imageInfo,
          { alt, src: newSrc, title }
        )
      }
    } catch (error) {
      console.error('Unexpected error on image action:', error)
    }
  } else {
    selector.hide()
  }
  selector.muya.eventCenter.dispatch('stateChange')
}

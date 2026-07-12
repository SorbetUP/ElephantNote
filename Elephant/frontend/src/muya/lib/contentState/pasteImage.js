import { IMAGE_EXT_REG } from '../config'
import {
  getImageInfo as getImageSrc,
  getUniqueId
} from '../utils'
import { getImageInfo } from '../utils/getImageInfo'

const insertLoadingImage = (contentState, id, src) => {
  if (contentState.selectedImage) {
    contentState.replaceImage(contentState.selectedImage, { alt: id, src })
  } else {
    contentState.insertImage({ alt: id, src })
  }
}

const finishImageAction = (contentState, id, src) => {
  const wrapper = contentState.muya.container.querySelector(
    `span[data-id=${id}]`
  )
  if (wrapper) {
    contentState.replaceImage(getImageInfo(wrapper), { src })
  }
}

const pasteImage = ContentState => {
  ContentState.prototype.pasteImage = async function(event) {
    const imagePath = this.muya.options.clipboardFilePath()
    if (
      imagePath &&
      typeof imagePath === 'string' &&
      IMAGE_EXT_REG.test(imagePath)
    ) {
      const id = `loading-${getUniqueId()}`
      insertLoadingImage(this, id, imagePath)
      let newSrc = null
      try {
        newSrc = await this.muya.options.imageAction(imagePath, id)
      } catch (error) {
        console.error('Unexpected error on image action:', error)
        return null
      }
      const { src } = getImageSrc(imagePath)
      if (src) this.stateRender.urlMap.set(newSrc, src)
      finishImageAction(this, id, newSrc)
      return imagePath
    }

    const items = event.clipboardData && event.clipboardData.items
    let file = null
    if (items && items.length) {
      for (let index = 0; index < items.length; index++) {
        if (items[index].type.indexOf('image') !== -1) {
          file = items[index].getAsFile()
          break
        }
      }
    }
    if (!file) return null

    const id = `loading-${getUniqueId()}`
    insertLoadingImage(this, id, '')
    const reader = new FileReader()
    reader.onload = readerEvent => {
      const base64 = readerEvent.target.result
      const wrapper = this.muya.container.querySelector(
        `span[data-id=${id}]`
      )
      const imageContainer = this.muya.container.querySelector(
        `span[data-id=${id}] .ag-image-container`
      )
      this.stateRender.urlMap.set(id, base64)
      if (imageContainer) {
        wrapper.classList.remove('ag-empty-image')
        wrapper.classList.add('ag-image-success')
        const image = document.createElement('img')
        image.src = base64
        imageContainer.appendChild(image)
      }
    }
    reader.readAsDataURL(file)

    let newSrc = null
    try {
      newSrc = await this.muya.options.imageAction(file, id)
    } catch (error) {
      console.error('Unexpected error on image action:', error)
      return null
    }
    const base64 = this.stateRender.urlMap.get(id)
    if (base64) {
      this.stateRender.urlMap.set(newSrc, base64)
      this.stateRender.urlMap.delete(id)
    }
    finishImageAction(this, id, newSrc)
    return file
  }
}

export default pasteImage

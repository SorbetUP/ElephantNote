import { insertAfter, operateClassName } from '../../../utils/domManipulate'

export const setImageFailureInfo = (
  imageText,
  { src = '', domsrc = '', reason = 'load-error' } = {}
) => {
  if (!imageText) return
  imageText.dataset.imageSrc = src
  imageText.dataset.imageDomsrc = domsrc
  imageText.dataset.imageError = reason
  imageText.setAttribute(
    'title',
    `Failed to load image\nSource: ${src || 'empty'}\nResolved: ${domsrc || 'empty'}\nReason: ${reason}`
  )
  const imageContainer = imageText.querySelector('.ag-image-container')
  if (imageContainer) {
    imageContainer.dataset.imageSrc = src
    imageContainer.dataset.imageDomsrc = domsrc
    imageContainer.dataset.imageError = reason
  }
}

export const addImageToContainer = (imageText, img, className) => {
  if (imageText.classList.contains('ag-inline-image')) {
    const imageContainer = imageText.querySelector('.ag-image-container')
    const oldImage = imageContainer.querySelector('img')
    if (oldImage) oldImage.remove()
    imageContainer.appendChild(img)
    imageText.classList.remove('ag-image-loading')
    imageText.classList.remove('ag-image-fail')
    imageText.classList.add('ag-image-success')
    imageText.removeAttribute('title')
  } else {
    insertAfter(img, imageText)
    operateClassName(imageText, 'add', className)
  }
}

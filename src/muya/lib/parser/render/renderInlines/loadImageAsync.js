import { getUniqueId } from '../../../utils'
import { insertAfter, operateClassName } from '../../../utils/domManipulate'
import { CLASS_OR_ID } from '../../../config'

const isAbsoluteLocalPath = (value = '') => /^\//.test(value) || /^[a-zA-Z]:[\\/]/.test(value)

const encodeLocalPath = (value = '') => value
  .replace(/\\/g, '/')
  .split('/')
  .map((part, index) => (index === 0 ? part : encodeURIComponent(decodeURIComponent(part))))
  .join('/')

const appendCacheBuster = (value = '', dispMsec) => {
  const separator = value.includes('?') ? '&' : '?'
  return `${value}${separator}msec=${dispMsec}`
}

const createDomImageSrc = (src = '', dispMsec = Date.now()) => {
  const normalized = String(src || '').trim()
  if (!normalized) return ''
  if (/^file:\/\//i.test(normalized)) return appendCacheBuster(normalized, dispMsec)
  if (isAbsoluteLocalPath(normalized)) return appendCacheBuster(`file://${encodeLocalPath(normalized)}`, dispMsec)
  return normalized.replace(/ /g, '%20')
}

const setImageFailureInfo = (imageText, { src = '', domsrc = '', reason = 'load-error' } = {}) => {
  if (!imageText) return
  imageText.dataset.imageSrc = src
  imageText.dataset.imageDomsrc = domsrc
  imageText.dataset.imageError = reason
  imageText.setAttribute('title', `Failed to load image\nSource: ${src || 'empty'}\nResolved: ${domsrc || 'empty'}\nReason: ${reason}`)
  const imageContainer = imageText.querySelector('.ag-image-container')
  if (imageContainer) {
    imageContainer.dataset.imageSrc = src
    imageContainer.dataset.imageDomsrc = domsrc
    imageContainer.dataset.imageError = reason
  }
}

const addImageToContainer = (imageText, img, className) => {
  if (imageText.classList.contains('ag-inline-image')) {
    const imageContainer = imageText.querySelector('.ag-image-container')
    const oldImage = imageContainer.querySelector('img')
    if (oldImage) {
      oldImage.remove()
    }
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

export default function loadImageAsync(imageInfo, attrs, className, imageClass) {
  let { src } = imageInfo
  let id
  let isSuccess
  let w
  let h
  let domsrc

  src = String(src || '').replace(/ /g, '%20')

  let reload = false
  if (this.loadImageMap.has(src)) {
    const imageInfo = this.loadImageMap.get(src)
    if (imageInfo.dispMsec !== imageInfo.touchMsec) reload = true
  } else {
    reload = true
  }
  if (reload) {
    let addedToImageContainer = false
    id = getUniqueId()

    const img = document.createElement('img')
    let dispMsec = Date.now()
    let touchMsec = dispMsec
    domsrc = createDomImageSrc(src, dispMsec)
    img.src = domsrc
    img.dataset.originalSrc = src
    img.dataset.resolvedSrc = domsrc
    if (attrs.alt) img.alt = attrs.alt.replace(/[`*{}[\]()#+\-.!_>~:|<>$]/g, '')
    if (attrs.title) img.setAttribute('title', attrs.title)
    if (attrs.width && typeof attrs.width === 'number') img.setAttribute('width', attrs.width)
    if (attrs.height && typeof attrs.height === 'number') img.setAttribute('height', attrs.height)
    if (imageClass) img.classList.add(imageClass)

    if (this.urlMap.has(src)) this.urlMap.delete(src)

    const imageText = document.querySelector(`#${id}`)
    if (imageText) {
      addImageToContainer(imageText, img, className)
      addedToImageContainer = true
    }

    img.onload = () => {
      const imageText = document.querySelector(`#${id}`)
      if (imageText && !addedToImageContainer) {
        addImageToContainer(imageText, img, className)
        addedToImageContainer = true
      }

      this.loadImageMap.set(src, {
        id,
        isSuccess: true,
        img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        dispMsec,
        touchMsec,
        domsrc,
        addedToImageContainer
      })
    }
    img.onerror = () => {
      const imageText = document.querySelector(`#${id}`)
      if (imageText) {
        operateClassName(imageText, 'remove', CLASS_OR_ID.AG_IMAGE_LOADING)
        operateClassName(imageText, 'add', CLASS_OR_ID.AG_IMAGE_FAIL)
        setImageFailureInfo(imageText, { src, domsrc, reason: isAbsoluteLocalPath(src) ? 'local-file-load-error' : 'image-load-error' })
        const image = imageText.querySelector('img')
        if (image) image.remove()
      }
      console.warn('[image] failed to load', { src, domsrc })
      if (this.urlMap.has(src)) this.urlMap.delete(src)
      this.loadImageMap.set(src, {
        id,
        isSuccess: false,
        domsrc,
        error: isAbsoluteLocalPath(src) ? 'local-file-load-error' : 'image-load-error',
        addedToImageContainer: false
      })
    }
  } else {
    const imageInfo = this.loadImageMap.get(src)
    id = imageInfo.id
    isSuccess = imageInfo.isSuccess
    w = imageInfo.width
    h = imageInfo.height
    domsrc = imageInfo.domsrc
    if (!imageInfo.addedToImageContainer && imageInfo.img) {
      const imageText = document.querySelector(`#${id}`)
      if (imageText) {
        addImageToContainer(imageText, imageInfo.img, className)
        this.loadImageMap.set(src, { ...imageInfo, addedToImageContainer: true })
      }
    }
  }

  return { id, isSuccess, domsrc, width: w, height: h }
}

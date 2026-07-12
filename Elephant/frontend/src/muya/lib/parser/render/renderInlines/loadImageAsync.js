import { getUniqueId } from '../../../utils'
import { operateClassName } from '../../../utils/domManipulate'
import { CLASS_OR_ID } from '../../../config'
import { addImageToContainer, setImageFailureInfo } from './imageDom'
import { createDomImageSrc, readLocalImageDataUrl, resolveLocalFilePath } from './imageSource'

const configureImageElement = (img, attrs, imageClass) => {
  if (attrs.alt) img.alt = attrs.alt.replace(/[`*{}[\]()#+\-.!_>~:|<>$]/g, '')
  if (attrs.title) img.setAttribute('title', attrs.title)
  if (attrs.width && typeof attrs.width === 'number') img.setAttribute('width', attrs.width)
  if (attrs.height && typeof attrs.height === 'number') img.setAttribute('height', attrs.height)
  if (imageClass) img.classList.add(imageClass)
}

const shouldReload = (stateRender, src) => {
  if (!stateRender.loadImageMap.has(src)) return true
  const cached = stateRender.loadImageMap.get(src)
  return cached.dispMsec !== cached.touchMsec
}

const restoreCachedImage = (stateRender, src, className) => {
  const imageInfo = stateRender.loadImageMap.get(src)
  if (!imageInfo.addedToImageContainer && imageInfo.img) {
    const imageText = document.querySelector(`#${imageInfo.id}`)
    if (imageText) {
      addImageToContainer(imageText, imageInfo.img, className)
      stateRender.loadImageMap.set(src, { ...imageInfo, addedToImageContainer: true })
    }
  }
  return {
    id: imageInfo.id,
    isSuccess: imageInfo.isSuccess,
    domsrc: imageInfo.domsrc,
    width: imageInfo.width,
    height: imageInfo.height
  }
}

export default function loadImageAsync(imageInfo, attrs, className, imageClass) {
  let src = String(imageInfo.src || '').replace(/ /g, '%20')
  const localPath = resolveLocalFilePath(src)

  if (!shouldReload(this, src)) {
    return restoreCachedImage(this, src, className)
  }

  let addedToImageContainer = false
  const id = getUniqueId()
  const img = document.createElement('img')
  const dispMsec = Date.now()
  const touchMsec = dispMsec
  let domsrc = createDomImageSrc(src, dispMsec)

  img.dataset.originalSrc = src
  img.dataset.localPath = localPath
  img.dataset.localResolvedPath = localPath
  img.dataset.resolvedSrc = domsrc
  configureImageElement(img, attrs, imageClass)

  if (this.urlMap.has(src)) this.urlMap.delete(src)

  const imageText = document.querySelector(`#${id}`)
  if (imageText) {
    addImageToContainer(imageText, img, className)
    addedToImageContainer = true
  }

  const fail = (reason = 'image-load-error') => {
    const failedImageText = document.querySelector(`#${id}`)
    if (failedImageText) {
      operateClassName(failedImageText, 'remove', CLASS_OR_ID.AG_IMAGE_LOADING)
      operateClassName(failedImageText, 'add', CLASS_OR_ID.AG_IMAGE_FAIL)
      setImageFailureInfo(failedImageText, { src, domsrc, reason })
      const image = failedImageText.querySelector('img')
      if (image) image.remove()
    }
    console.warn('[image] failed to load', { src, domsrc, localPath, reason })
    if (this.urlMap.has(src)) this.urlMap.delete(src)
    this.loadImageMap.set(src, {
      id,
      isSuccess: false,
      domsrc,
      localPath,
      error: reason,
      addedToImageContainer: false
    })
  }

  img.onload = () => {
    const loadedImageText = document.querySelector(`#${id}`)
    if (loadedImageText && !addedToImageContainer) {
      addImageToContainer(loadedImageText, img, className)
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
      localPath,
      addedToImageContainer
    })
  }
  img.onerror = () => fail(localPath ? 'local-object-url-load-error' : 'image-load-error')

  if (localPath) {
    readLocalImageDataUrl(localPath)
      .then((dataUrl) => {
        domsrc = dataUrl
        img.dataset.localImageLoaded = 'true'
        img.dataset.resolvedSrc = dataUrl
        img.src = dataUrl
      })
      .catch((error) => fail(error?.message || 'local-file-read-error'))
    img.dataset.resolvedSrc = localPath
  } else {
    img.src = domsrc
  }

  return { id, isSuccess: undefined, domsrc, width: undefined, height: undefined }
}

import { CLASS_OR_ID } from '../../../../config'

export const resolveImageSourceState = (renderer, block, token, imageInfo) => {
  let id
  let isSuccess
  let domsrc
  let { src } = imageInfo
  const { alt } = token.attrs
  src = src.replace(/ /g, '%20')

  if (src) {
    ;({ id, isSuccess, domsrc } = renderer.loadImageAsync(imageInfo, token.attrs))
  }

  let wrapperSelector = id
    ? `span#${isSuccess ? block.key + '_' + id + '_' + token.range.start : id}.${CLASS_OR_ID.AG_INLINE_IMAGE}`
    : `span.${CLASS_OR_ID.AG_INLINE_IMAGE}`

  if (typeof token.attrs['data-align'] === 'string') {
    wrapperSelector += `.${token.attrs['data-align']}`
  }

  if (renderer.urlMap.has(src)) {
    const { selectedImage } = renderer.muya.contentState
    if (selectedImage && selectedImage.token.attrs.src === src && selectedImage.imageId !== id) {
      selectedImage.imageId = id
    }
    src = renderer.urlMap.get(src)
    isSuccess = true
  }

  const dataset = { raw: token.raw }
  if (alt.startsWith('loading-')) {
    wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_UPLOADING}`
    dataset.id = alt
    if (renderer.urlMap.has(alt)) {
      src = renderer.urlMap.get(alt)
      isSuccess = true
    }
  }
  return { wrapperSelector, dataset, src, isSuccess, domsrc }
}

export const applyImageStateClasses = (
  wrapperSelector,
  src,
  isSuccess,
  selectedImage,
  block,
  token
) => {
  if (!src) return `${wrapperSelector}.${CLASS_OR_ID.AG_EMPTY_IMAGE}`
  if (typeof isSuccess === 'undefined') {
    wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_LOADING}`
  } else if (isSuccess === true) {
    wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_SUCCESS}`
  } else {
    wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_FAIL}`
  }
  if (selectedImage) {
    const { key, token: selectedToken } = selectedImage
    if (
      key === block.key &&
      selectedToken.range.start === token.range.start &&
      selectedToken.range.end === token.range.end
    ) {
      wrapperSelector += `.${CLASS_OR_ID.AG_INLINE_IMAGE_SELECTED}`
    }
  }
  return wrapperSelector
}

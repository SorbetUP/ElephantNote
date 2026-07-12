import { operateClassName } from '../utils/domManipulate'
import { getImageInfo } from '../utils/getImageInfo'
import { CLASS_OR_ID } from '../config'
import selection from '../selection'

const selectionText = node => {
  const textLen = node.textContent.length
  operateClassName(node, 'remove', CLASS_OR_ID.AG_HIDE)
  operateClassName(node, 'add', CLASS_OR_ID.AG_GRAY)
  selection.importSelection({ start: textLen, end: textLen }, node)
}

export default function handleClickMedia(event, muya) {
  const { target } = event
  const { eventCenter, contentState } = muya
  const markedImageText = target.previousElementSibling
  const mathRender = target.closest(`.${CLASS_OR_ID.AG_MATH_RENDER}`)
  const rubyRender = target.closest(`.${CLASS_OR_ID.AG_RUBY_RENDER}`)
  const imageWrapper = target.closest(`.${CLASS_OR_ID.AG_INLINE_IMAGE}`)
  const codeCopy = target.closest('.ag-code-copy')
  const footnoteBackLink = target.closest('.ag-footnote-backlink')
  const imageDelete =
    target.closest('.ag-image-icon-delete') || target.closest('.ag-image-icon-close')
  const mathText = mathRender && mathRender.previousElementSibling
  const rubyText = rubyRender && rubyRender.previousElementSibling

  if (markedImageText && markedImageText.classList.contains(CLASS_OR_ID.AG_IMAGE_MARKED_TEXT)) {
    eventCenter.dispatch('format-click', {
      event,
      formatType: 'image',
      data: event.target.getAttribute('src')
    })
    selectionText(markedImageText)
  } else if (mathText) {
    selectionText(mathText)
  } else if (rubyText) {
    selectionText(rubyText)
  }

  if (codeCopy) {
    event.stopPropagation()
    event.preventDefault()
    return { handled: true, value: contentState.copyCodeBlock(event) }
  }

  if (imageDelete && imageWrapper) {
    const imageInfo = getImageInfo(imageWrapper)
    event.preventDefault()
    event.stopPropagation()
    eventCenter.dispatch('muya-image-selector', { reference: null })
    return { handled: true, value: contentState.deleteImage(imageInfo) }
  }

  if (footnoteBackLink) {
    event.preventDefault()
    event.stopPropagation()
    const figure = event.target.closest('figure')
    const identifier = figure.querySelector('span.ag-footnote-input').textContent
    if (identifier) {
      const footnoteIdentifier = document.querySelector(`#noteref-${identifier}`)
      if (footnoteIdentifier) footnoteIdentifier.scrollIntoView({ behavior: 'smooth' })
    }
    return { handled: true, value: undefined }
  }

  if (target.tagName === 'IMG' && imageWrapper) {
    const imageInfo = getImageInfo(imageWrapper)
    event.preventDefault()
    eventCenter.dispatch('select-image', imageInfo)
    const rect = imageWrapper.querySelector('.ag-image-container').getBoundingClientRect()
    const reference = {
      getBoundingClientRect() {
        return rect
      },
      width: imageWrapper.offsetWidth,
      height: imageWrapper.offsetHeight
    }
    eventCenter.dispatch('muya-image-toolbar', { reference, imageInfo })
    contentState.selectImage(imageInfo)
    const imageSelector =
      imageInfo.imageId.indexOf('_') > -1
        ? `#${imageInfo.imageId}`
        : `#${imageInfo.key}_${imageInfo.imageId}_${imageInfo.token.range.start}`
    const imageContainer = document.querySelector(`${imageSelector} .ag-image-container`)
    eventCenter.dispatch('muya-transformer', { reference: imageContainer, imageInfo })
    return { handled: true, value: undefined }
  }

  if (
    imageWrapper &&
    (imageWrapper.classList.contains('ag-empty-image') ||
      imageWrapper.classList.contains('ag-image-fail'))
  ) {
    const rect = imageWrapper.getBoundingClientRect()
    const reference = {
      getBoundingClientRect() {
        return rect
      }
    }
    const imageInfo = getImageInfo(imageWrapper)
    eventCenter.dispatch('muya-image-selector', {
      reference,
      imageInfo,
      cb: () => {}
    })
    event.preventDefault()
    return { handled: true, value: event.stopPropagation() }
  }

  return { handled: false, value: undefined }
}

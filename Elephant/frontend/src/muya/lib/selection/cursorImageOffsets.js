import { CLASS_OR_ID } from '../config'
import { getOffsetOfParagraph, getTextContent } from './dom'

const ignoredRenderers = [
  CLASS_OR_ID.AG_MATH_RENDER,
  CLASS_OR_ID.AG_RUBY_RENDER
]

const offsetBeforeImage = (imageWrapper, paragraph) => {
  const previous = imageWrapper.previousElementSibling
  let offset = 0
  if (previous) {
    offset += getOffsetOfParagraph(previous, paragraph)
    offset += getTextContent(previous, ignoredRenderers).length
  }
  return offset
}

export const adjustImageOffsets = (
  anchorNode,
  anchorOffset,
  focusNode,
  focusOffset,
  anchorParagraph,
  anchorValue,
  focusValue
) => {
  let anchorResult = anchorValue
  let focusResult = focusValue
  if (
    anchorNode === focusNode &&
    anchorOffset === focusOffset &&
    anchorNode?.parentNode?.classList.contains('ag-image-container') &&
    anchorNode.previousElementSibling?.nodeName === 'IMG'
  ) {
    const imageWrapper = anchorNode.parentNode.parentNode
    anchorResult = offsetBeforeImage(imageWrapper, anchorParagraph)
    anchorResult += getTextContent(imageWrapper, ignoredRenderers).length
    focusResult = anchorResult
  }
  if (
    anchorNode === focusNode &&
    anchorNode?.nodeType === 1 &&
    anchorNode.classList.contains('ag-image-container') &&
    anchorNode.parentNode
  ) {
    const imageWrapper = anchorNode.parentNode
    anchorResult = offsetBeforeImage(imageWrapper, anchorParagraph)
    if (anchorOffset === 1) {
      anchorResult += getTextContent(imageWrapper, ignoredRenderers).length
    }
    focusResult = anchorResult
  }
  return { anchorValue: anchorResult, focusValue: focusResult }
}

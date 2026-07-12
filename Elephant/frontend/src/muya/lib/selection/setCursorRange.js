import { CLASS_OR_ID } from '../config'
import { getTextContent } from './dom'

const getNodeAndOffset = (node, offset) => {
  if (node.nodeType === 3) return { node, offset }

  const childNodes = node.childNodes
  let count = 0
  for (let index = 0; index < childNodes.length; index++) {
    const child = childNodes[index]
    const textContent = getTextContent(child, [
      CLASS_OR_ID.AG_MATH_RENDER,
      CLASS_OR_ID.AG_RUBY_RENDER
    ])
    const textLength = textContent.length
    if (child.classList && child.classList.contains(CLASS_OR_ID.AG_FRONT_ICON)) {
      continue
    }

    const reachesOffset = /^\n$/.test(textContent) && index !== childNodes.length - 1
      ? count + textLength > offset
      : count + textLength >= offset
    if (reachesOffset) {
      if (child.classList && child.classList.contains('ag-inline-image')) {
        const imageContainer = child.querySelector('.ag-image-container')
        const hasImage = imageContainer.querySelector('img')
        if (!hasImage) return { node: child, offset: 0 }
        if (count + textLength === offset) {
          return child.nextElementSibling
            ? { node: child.nextElementSibling, offset: 0 }
            : { node: imageContainer, offset: 1 }
        }
        if (count === offset && count === 0) {
          return { node: imageContainer, offset: 0 }
        }
        return { node: child, offset: 0 }
      }
      return getNodeAndOffset(child, offset - count)
    }
    count += textLength
  }
  return { node, offset }
}

export default function setCursorRange(selection, cursorRange) {
  const { anchor, focus } = cursorRange
  const anchorParagraph = selection.doc.querySelector(`#${anchor.key}`)
  const focusParagraph = selection.doc.querySelector(`#${focus.key}`)
  if (!anchorParagraph || !focusParagraph) return

  let { node: anchorNode, offset: anchorOffset } = getNodeAndOffset(
    anchorParagraph,
    anchor.offset
  )
  let { node: focusNode, offset: focusOffset } = getNodeAndOffset(
    focusParagraph,
    focus.offset
  )

  if (
    anchorNode.nodeType === 3 ||
    (anchorNode.nodeType === 1 &&
      !anchorNode.classList.contains('ag-image-container'))
  ) {
    anchorOffset = Math.min(anchorOffset, anchorNode.textContent.length)
    focusOffset = Math.min(focusOffset, focusNode.textContent.length)
  }

  selection.select(anchorNode, anchorOffset)
  selection.setFocus(focusNode, focusOffset)
}

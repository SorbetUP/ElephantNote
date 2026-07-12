import { CLASS_OR_ID } from '../config'

export const getTextContent = (node, blackList) => {
  if (node.nodeType === 3) return node.textContent
  if (!blackList) return node.textContent

  let text = ''
  if (blackList.some(className => node.classList && node.classList.contains(className))) {
    return text
  }

  if (node.nodeType === 1 && node.classList.contains('ag-inline-image')) {
    const raw = node.getAttribute('data-raw')
    const imageContainer = node.querySelector('.ag-image-container')
    const hasImg = imageContainer.querySelector('img')
    const childNodes = imageContainer.childNodes
    if (childNodes.length && hasImg) {
      for (const child of childNodes) {
        if (child.nodeType === 1 && child.nodeName === 'IMG') text += raw
        else if (child.nodeType === 3) text += child.textContent
      }
      return text
    }
    return text + raw
  }

  for (const child of node.childNodes) text += getTextContent(child, blackList)
  return text
}

export const getOffsetOfParagraph = (node, paragraph) => {
  let offset = 0
  let preSibling = node
  if (node === paragraph) return offset

  do {
    preSibling = preSibling.previousSibling
    if (preSibling) {
      offset += getTextContent(preSibling, [
        CLASS_OR_ID.AG_MATH_RENDER,
        CLASS_OR_ID.AG_RUBY_RENDER
      ]).length
    }
  } while (preSibling)

  return node === paragraph || node.parentNode === paragraph
    ? offset
    : offset + getOffsetOfParagraph(node.parentNode, paragraph)
}

import { CLASS_OR_ID } from '../config'

export const isAganippeParagraph = element => {
  return element && element.classList && element.classList.contains(CLASS_OR_ID.AG_PARAGRAPH)
}

export const isMuyaEditorElement = element => {
  return element && element.id === CLASS_OR_ID.AG_EDITOR_ID
}

export const findNearestParagraph = node => {
  if (!node) return null
  do {
    if (isAganippeParagraph(node)) return node
    node = node.parentNode
  } while (node)
  return null
}

export const findOutMostParagraph = node => {
  do {
    const parentNode = node.parentNode
    if (isMuyaEditorElement(parentNode) && isAganippeParagraph(node)) return node
    node = parentNode
  } while (node)
  return null
}

export const traverseUp = (current, testElementFunction) => {
  if (!current) return false
  do {
    if (current.nodeType === 1) {
      if (testElementFunction(current)) return current
      if (isMuyaEditorElement(current)) return false
    }
    current = current.parentNode
  } while (current)
  return false
}

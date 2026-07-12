import {
  LOWERCASE_TAGS,
  blockContainerElementNames,
  emptyElementNames
} from '../config'
import { isMuyaEditorElement, traverseUp } from './domParagraphs'

export const isBlockContainer = element => {
  return element &&
    element.nodeType !== 3 &&
    blockContainerElementNames.indexOf(element.nodeName.toLowerCase()) !== -1
}

export const getFirstSelectableLeafNode = element => {
  while (element && element.firstChild) element = element.firstChild

  element = traverseUp(element, el => {
    return emptyElementNames.indexOf(el.nodeName.toLowerCase()) === -1
  })
  if (element && element.nodeName.toLowerCase() === LOWERCASE_TAGS.table) {
    const firstCell = element.querySelector('th, td')
    if (firstCell) element = firstCell
  }
  return element
}

export const getClosestBlockContainer = node => {
  return traverseUp(node, current => {
    return isBlockContainer(current) || isMuyaEditorElement(current)
  })
}

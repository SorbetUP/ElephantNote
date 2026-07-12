import { CLASS_OR_ID } from '../../../config'
import { renderContainerFigure } from './renderContainerFigure'
import { renderContainerPre } from './renderContainerPre'
import { renderContainerTableCell } from './renderContainerTableCell'

export const renderContainerSemantic = (
  renderer,
  parent,
  block,
  activeBlocks,
  selector,
  data,
  children,
  t
) => {
  const { type, headingStyle, listType, listItemType, bulletMarkerOrDelimiter, isLooseListItem } = block
  if (/^(?:th|td)$/.test(type)) {
    return renderContainerTableCell(renderer, parent, block, activeBlocks, selector, data, children)
  }
  if (/^h/.test(type)) {
    if (/^h\d$/.test(type)) {
      Object.assign(data.dataset, { head: type })
      selector += `.${headingStyle}`
    }
    Object.assign(data.dataset, { role: type })
  } else if (type === 'figure') {
    selector = renderContainerFigure(block, activeBlocks, selector, data, children, t)
  } else if (/ul|ol/.test(type) && listType) {
    selector += `.ag-${listType}-list`
    if (type === 'ol') Object.assign(data.attrs, { start: block.start })
  } else if (type === 'li' && listItemType) {
    Object.assign(data.dataset, { marker: bulletMarkerOrDelimiter })
    selector += `.${CLASS_OR_ID.AG_LIST_ITEM}`
    selector += `.ag-${listItemType}-list-item`
    selector += isLooseListItem
      ? `.${CLASS_OR_ID.AG_LOOSE_LIST_ITEM}`
      : `.${CLASS_OR_ID.AG_TIGHT_LIST_ITEM}`
  } else if (type === 'pre') {
    selector = renderContainerPre(renderer, block, selector, data)
  }
  return selector
}

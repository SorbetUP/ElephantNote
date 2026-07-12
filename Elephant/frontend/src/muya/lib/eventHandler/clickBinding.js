import { CLASS_OR_ID } from '../config'
import handleClickMedia from './clickMedia'

const getToolItem = target => target.closest('[data-label]')

export default function bindClick(muya) {
  const { container, eventCenter, contentState } = muya
  const handler = event => {
    const { target } = event
    const toolItem = getToolItem(target)
    contentState.selectedImage = null
    contentState.selectedTableCells = null

    if (toolItem) {
      event.preventDefault()
      event.stopPropagation()
      const type = toolItem.getAttribute('data-label')
      const grandPa = toolItem.parentNode.parentNode
      if (grandPa.classList.contains('ag-tool-table')) {
        contentState.tableToolBarClick(type)
      }
    }

    if (target.classList.contains('ag-drag-handler')) {
      event.preventDefault()
      event.stopPropagation()
      const rect = target.getBoundingClientRect()
      const reference = {
        getBoundingClientRect() {
          return rect
        },
        width: rect.offsetWidth,
        height: rect.offsetHeight
      }
      eventCenter.dispatch('muya-table-bar', {
        reference,
        tableInfo: {
          barType: target.classList.contains('left') ? 'left' : 'bottom'
        }
      })
    }

    const mediaResult = handleClickMedia(event, muya)
    if (mediaResult.handled) return mediaResult.value

    if (target.closest('div.ag-container-preview') || target.closest('div.ag-html-preview')) {
      event.stopPropagation()
      if (target.closest('div.ag-container-preview')) {
        event.preventDefault()
        const figureEle = target.closest('figure')
        contentState.handleContainerBlockClick(figureEle)
      }
      return
    }

    const editIcon = target.closest('.ag-container-icon')
    if (editIcon) {
      event.preventDefault()
      event.stopPropagation()
      if (editIcon.parentNode.classList.contains('ag-container-block')) {
        contentState.handleContainerBlockClick(editIcon.parentNode)
      }
    }

    if (
      target.tagName === 'INPUT' &&
      target.classList.contains(CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX)
    ) {
      contentState.listItemCheckBoxClick(target)
    }
    contentState.clickHandler(event)
  }

  eventCenter.attachDOMEvent(container, 'click', handler)
}

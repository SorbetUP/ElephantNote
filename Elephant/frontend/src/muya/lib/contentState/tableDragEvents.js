import {
  calculateAspects,
  getAllTableCells,
  getDragCells,
  getIndex
} from './tableDragGeometry'

const tableDragEvents = ContentState => {
  ContentState.prototype.handleMouseDown = function(event) {
    event.preventDefault()
    const { eventCenter } = this.muya
    const { clientX, clientY, target } = event
    const tableId = target.closest('table').id
    const barType = target.classList.contains('left') ? 'left' : 'bottom'
    const index = getIndex(barType, target)
    this.dragInfo = {
      tableId,
      clientX,
      clientY,
      barType,
      index,
      curIndex: index,
      dragCells: getDragCells(tableId, barType, index),
      cells: getAllTableCells(tableId),
      aspects: calculateAspects(tableId, barType),
      offset: 0
    }

    for (const row of this.dragInfo.cells) {
      for (const cell of row) {
        if (!this.dragInfo.dragCells.includes(cell)) cell.classList.add('ag-cell-transform')
      }
    }

    const mouseMoveId = eventCenter.attachDOMEvent(
      document,
      'mousemove',
      this.handleMouseMove.bind(this)
    )
    const mouseUpId = eventCenter.attachDOMEvent(
      document,
      'mouseup',
      this.handleMouseUp.bind(this)
    )
    this.dragEventIds.push(mouseMoveId, mouseUpId)
  }

  ContentState.prototype.handleMouseMove = function(event) {
    if (!this.dragInfo) return
    const { barType } = this.dragInfo
    const attrName = barType === 'bottom' ? 'clientX' : 'clientY'
    const offset = (this.dragInfo.offset = event[attrName] - this.dragInfo[attrName])
    if (Math.abs(offset) < 5) return
    this.isDragTableBar = true
    this.hideUnnecessaryBar()
    this.calculateCurIndex()
    this.setDragTargetStyle()
    this.setSwitchStyle()
  }

  ContentState.prototype.handleMouseUp = function(event) {
    const { eventCenter } = this.muya
    for (const id of this.dragEventIds) eventCenter.detachDOMEvent(id)
    this.dragEventIds = []
    if (!this.isDragTableBar) return
    this.setDropTargetStyle()
    setTimeout(() => {
      this.switchTableData()
      this.resetDragTableBar()
    }, 300)
  }

  ContentState.prototype.hideUnnecessaryBar = function() {
    const { barType } = this.dragInfo
    const hideClassName = barType === 'bottom' ? 'left' : 'bottom'
    const needHideBar = document.querySelector(`.ag-drag-handler.${hideClassName}`)
    if (needHideBar) needHideBar.style.display = 'none'
  }

  ContentState.prototype.calculateCurIndex = function() {
    let { offset, aspects, index } = this.dragInfo
    let curIndex = index
    const len = aspects.length
    if (offset > 0) {
      for (let i = index; i < len; i++) {
        const aspect = aspects[i]
        offset -= i === index ? Math.floor(aspect / 2) : aspect
        if (offset < 0) break
        curIndex++
      }
    } else if (offset < 0) {
      for (let i = index; i >= 0; i--) {
        const aspect = aspects[i]
        offset += i === index ? Math.floor(aspect / 2) : aspect
        if (offset > 0) break
        curIndex--
      }
    }
    this.dragInfo.curIndex = Math.max(0, Math.min(curIndex, len - 1))
  }

  ContentState.prototype.resetDragTableBar = function() {
    this.dragInfo = null
    this.isDragTableBar = false
  }
}

export default tableDragEvents

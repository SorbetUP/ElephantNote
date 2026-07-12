const tableDragStyles = ContentState => {
  ContentState.prototype.setDragTargetStyle = function() {
    const { offset, barType, dragCells } = this.dragInfo
    for (const cell of dragCells) {
      if (!cell.classList.contains('ag-drag-cell')) {
        cell.classList.add('ag-drag-cell')
        cell.classList.add(`ag-drag-${barType}`)
      }
      const valueName = barType === 'bottom' ? 'translateX' : 'translateY'
      cell.style.transform = `${valueName}(${offset}px)`
    }
  }

  ContentState.prototype.setSwitchStyle = function() {
    const { index, offset, curIndex, barType, aspects, cells } = this.dragInfo
    const aspect = aspects[index]
    const len = aspects.length
    if (offset > 0) {
      if (barType === 'bottom') {
        for (const row of cells) {
          for (let i = 0; i < len; i++) {
            const cell = row[i]
            if (i > index && i <= curIndex) {
              cell.style.transform = `translateX(${-aspect}px)`
            } else if (i !== index) {
              cell.style.transform = 'translateX(0px)'
            }
          }
        }
      } else {
        for (let i = 0; i < len; i++) {
          const row = cells[i]
          for (const cell of row) {
            if (i > index && i <= curIndex) {
              cell.style.transform = `translateY(${-aspect}px)`
            } else if (i !== index) {
              cell.style.transform = 'translateY(0px)'
            }
          }
        }
      }
    } else if (barType === 'bottom') {
      for (const row of cells) {
        for (let i = 0; i < len; i++) {
          const cell = row[i]
          if (i >= curIndex && i < index) {
            cell.style.transform = `translateX(${aspect}px)`
          } else if (i !== index) {
            cell.style.transform = 'translateX(0px)'
          }
        }
      }
    } else {
      for (let i = 0; i < len; i++) {
        const row = cells[i]
        for (const cell of row) {
          if (i >= curIndex && i < index) {
            cell.style.transform = `translateY(${aspect}px)`
          } else if (i !== index) {
            cell.style.transform = 'translateY(0px)'
          }
        }
      }
    }
  }

  ContentState.prototype.setDropTargetStyle = function() {
    const { dragCells, barType, curIndex, index, aspects, offset } = this.dragInfo
    let move = 0
    if (offset > 0) {
      for (let i = index + 1; i <= curIndex; i++) move += aspects[i]
    } else {
      for (let i = curIndex; i < index; i++) move -= aspects[i]
    }
    for (const cell of dragCells) {
      cell.classList.remove('ag-drag-cell')
      cell.classList.remove(`ag-drag-${barType}`)
      cell.classList.add('ag-cell-transform')
      const valueName = barType === 'bottom' ? 'translateX' : 'translateY'
      cell.style.transform = `${valueName}(${move}px)`
    }
  }
}

export default tableDragStyles

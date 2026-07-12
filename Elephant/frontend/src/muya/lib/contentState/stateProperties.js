import Cursor from '../selection/cursor'

const selectedTableCells = {
  configurable: true,
  get() {
    return this._selectedTableCells
  },
  set(info) {
    const oldSelectedTableCells = this._selectedTableCells
    if (!info && !!oldSelectedTableCells) {
      const selectedCells = this.muya.container.querySelectorAll('.ag-cell-selected')
      for (const cell of Array.from(selectedCells)) {
        cell.classList.remove('ag-cell-selected')
        cell.classList.remove('ag-cell-border-top')
        cell.classList.remove('ag-cell-border-right')
        cell.classList.remove('ag-cell-border-bottom')
        cell.classList.remove('ag-cell-border-left')
      }
    }
    this._selectedTableCells = info
  }
}

const selectedImage = {
  configurable: true,
  get() {
    return this._selectedImage
  },
  set(image) {
    const oldSelectedImage = this._selectedImage
    if (!image && oldSelectedImage) {
      const selectedImages = this.muya.container.querySelectorAll('.ag-inline-image-selected')
      for (const img of selectedImages) {
        img.classList.remove('ag-inline-image-selected')
      }
    }
    this._selectedImage = image
  }
}

const cursor = {
  configurable: true,
  get() {
    return this.currentCursor
  },
  set(value) {
    const nextCursor = value instanceof Cursor ? value : new Cursor(value)
    this.prevCursor = this.currentCursor
    this.currentCursor = nextCursor

    const getHistoryState = () => {
      const { blocks, renderRange, currentCursor } = this
      return { blocks, renderRange, cursor: currentCursor }
    }

    if (nextCursor.noHistory) return
    if (nextCursor.isEdit) {
      if (this.historyTimer) clearTimeout(this.historyTimer)
      this.history.pushPending(getHistoryState())
      this.historyTimer = setTimeout(() => this.history.commitPending(), 1500)
    } else {
      this.history.push(getHistoryState())
    }
  }
}

export default (ContentState) => {
  Object.defineProperties(ContentState.prototype, {
    selectedTableCells,
    selectedImage,
    cursor
  })
}

export default (Muya) => {
  Object.assign(Muya.prototype, {
    getHistory() {
      return this.contentState.getHistory()
    },

    getTOC() {
      return this.contentState.getTOC()
    },

    setHistory(history) {
      return this.contentState.setHistory(history)
    },

    clearHistory() {
      return this.contentState.history.clearHistory()
    },

    getCursor() {
      return this.contentState.getCursor()
    },

    setCursor(cursor) {
      return this.setMarkdown(this.getMarkdown(), cursor, true)
    },

    getSelection() {
      return this.contentState.selectionChange()
    },

    hasFocus() {
      return document.activeElement === this.container
    },

    focus() {
      this.contentState.setCursor()
      this.container.focus()
    },

    blur(isRemoveAllRange = false, unSelect = false) {
      if (isRemoveAllRange) document.getSelection().removeAllRanges()
      if (unSelect) {
        this.contentState.selectedImage = null
        this.contentState.selectedTableCells = null
      }
      this.hideAllFloatTools()
      this.container.blur()
    },

    selectAll() {
      if (!this.hasFocus() && !this.contentState.selectedTableCells) return
      this.contentState.selectAll()
    }
  })
}

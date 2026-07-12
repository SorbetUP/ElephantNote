export default (Muya) => {
  Object.assign(Muya.prototype, {
    undo() {
      this.contentState.history.undo()
      this.dispatchSelectionChange()
      this.dispatchSelectionFormats()
      this.dispatchChange()
    },

    redo() {
      this.contentState.history.redo()
      this.dispatchSelectionChange()
      this.dispatchSelectionFormats()
      this.dispatchChange()
    },

    extractImages(markdown = this.markdown) {
      return this.contentState.extractImages(markdown)
    },

    copyAsRich() {
      this.clipboard.copyAsRich()
    },

    copyAsHtml() {
      this.clipboard.copyAsHtml()
    },

    pasteAsPlainText() {
      this.clipboard.pasteAsPlainText()
    },

    copy(info) {
      return this.clipboard.copy('copyBlock', info)
    }
  })
}

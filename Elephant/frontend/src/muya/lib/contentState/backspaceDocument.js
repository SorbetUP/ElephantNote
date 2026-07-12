const backspaceDocument = ContentState => {
  ContentState.prototype.docBackspaceHandler = function(event) {
    if (this.selectedImage) {
      event.preventDefault()
      return this.deleteImage(this.selectedImage)
    }
    if (this.selectedTableCells) {
      event.preventDefault()
      return this.deleteSelectedTableCells()
    }
  }
}

export default backspaceDocument

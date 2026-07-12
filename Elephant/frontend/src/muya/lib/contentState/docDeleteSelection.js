export function docDeleteHandler(event) {
  const { selectedImage } = this
  if (selectedImage) {
    event.preventDefault()
    this.selectedImage = null
    return this.deleteImage(selectedImage)
  }
  if (this.selectedTableCells) {
    event.preventDefault()
    return this.deleteSelectedTableCells()
  }
}

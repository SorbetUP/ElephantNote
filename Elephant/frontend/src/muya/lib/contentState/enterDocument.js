const enterDocument = ContentState => {
  ContentState.prototype.docEnterHandler = function(event) {
    const { eventCenter } = this.muya
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      event.stopPropagation()
      const { imageId, ...imageInfo } = selectedImage
      const imageWrapper = document.querySelector(`#${imageId}`)
      const rect = imageWrapper.getBoundingClientRect()
      const reference = {
        getBoundingClientRect() {
          rect.height = 0
          return rect
        }
      }
      eventCenter.dispatch('muya-image-selector', {
        reference,
        imageInfo,
        cb: () => {}
      })
      this.selectedImage = null
    }
  }
}

export default enterDocument

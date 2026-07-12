import { dropFileImage } from './dropFileImage'
import { dropUriImage } from './dropUriImage'

export const dropHandler = async function(event) {
  event.preventDefault()
  const { dropAnchor } = this
  this.hideGhost()

  if (event.dataTransfer.items.length) {
    for (const item of event.dataTransfer.items) dropUriImage(this, item, dropAnchor)
  }
  if (event.dataTransfer.files) {
    await dropFileImage(this, event.dataTransfer.files, dropAnchor)
    this.muya.eventCenter.dispatch('stateChange')
  }
}

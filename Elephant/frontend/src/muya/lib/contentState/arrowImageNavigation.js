import { EVENT_KEYS } from '../config'

export function docArrowHandler(event) {
  if (!this.selectedImage) return
  const { key, token } = this.selectedImage
  const { start, end } = token.range
  event.preventDefault()
  event.stopPropagation()
  const block = this.getBlock(key)
  const offset = /ArrowUp|ArrowLeft/.test(event.key) ? start : end
  if ([EVENT_KEYS.ArrowUp, EVENT_KEYS.ArrowLeft, EVENT_KEYS.ArrowDown, EVENT_KEYS.ArrowRight].includes(event.key)) {
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: false
    }
  }
  this.muya.keyboard.hideAllFloatTools()
  return this.singleRender(block)
}

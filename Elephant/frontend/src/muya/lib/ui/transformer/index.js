import './index.css'
import {
  createTransformerElements,
  updateTransformerElements
} from './elements'
import { listenTransformer } from './events'
import {
  finishTransformerResize,
  moveTransformerResize,
  startTransformerResize
} from './resize'

class Transformer {
  static pluginName = 'transformer'

  constructor(muya, options) {
    this.muya = muya
    this.options = options
    this.reference = null
    this.imageInfo = null
    this.movingAnchor = null
    this.status = false
    this.width = null
    this.eventId = []
    this.lastScrollTop = null
    this.resizing = false
    const container = this.container = document.createElement('div')
    container.classList.add('ag-transformer')
    document.body.appendChild(container)
    this.listen()
  }

  listen() {
    listenTransformer(this)
  }

  render() {
    const { eventCenter } = this.muya
    if (this.status) this.hide()
    this.status = true
    this.createElements()
    this.update()
    eventCenter.dispatch('muya-float', this, true)
  }

  createElements() {
    createTransformerElements(this)
  }

  update() {
    updateTransformerElements(this)
  }

  mouseDown = event => startTransformerResize(this, event)

  mouseMove = event => moveTransformerResize(this, event)

  mouseUp = event => finishTransformerResize(this, event)

  hide() {
    const { eventCenter } = this.muya
    const circles = this.container.querySelectorAll('.circle')
    Array.from(circles).forEach(circle => circle.remove())
    this.status = false
    eventCenter.dispatch('muya-float', this, false)
  }
}

export default Transformer

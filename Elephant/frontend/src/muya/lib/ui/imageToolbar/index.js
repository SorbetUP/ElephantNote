import BaseFloat from '../baseFloat'
import getIcons from './config'
import { URL_REG } from '../../config'
import { renderImageToolbar } from './view'

import './index.css'

const defaultOptions = {
  placement: 'top',
  modifiers: {
    offset: {
      offset: '0, 10'
    }
  },
  showArrow: false
}

class ImageToolbar extends BaseFloat {
  static pluginName = 'imageToolbar'

  constructor(muya, options = {}) {
    const name = 'ag-image-toolbar'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.imageInfo = null
    this.options = opts
    this.icons = getIcons(muya?.options?.t)
    this.reference = null
    const toolbarContainer = (this.toolbarContainer = document.createElement('div'))
    this.container.appendChild(toolbarContainer)
    this.floatBox.classList.add('ag-image-toolbar-container')
    this.listen()
  }

  listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('muya-image-toolbar', ({ reference, imageInfo }) => {
      this.reference = reference
      if (reference) {
        this.imageInfo = imageInfo
        setTimeout(() => {
          this.show(reference)
          this.render()
        }, 0)
      } else {
        this.hide()
      }
    })
  }

  render() {
    return renderImageToolbar(this)
  }

  selectItem(event, item) {
    event.preventDefault()
    event.stopPropagation()

    const { imageInfo } = this
    const isLocalImage = this.isLocalFile(imageInfo)
    switch (item.type) {
      case 'delete':
        this.muya.contentState.deleteImage(imageInfo)
        this.muya.eventCenter.dispatch('muya-transformer', {
          reference: null
        })
        return this.hide()
      case 'edit': {
        const rect = this.reference.getBoundingClientRect()
        const reference = {
          getBoundingClientRect() {
            rect.height = 0
            return rect
          }
        }
        this.muya.eventCenter.dispatch('muya-transformer', {
          reference: null
        })
        this.muya.eventCenter.dispatch('muya-image-selector', {
          reference,
          imageInfo,
          cb: () => {}
        })
        return this.hide()
      }
      case 'edit-excalidraw': {
        if (!this.canEditWithExcalidraw(imageInfo)) break
        const src = imageInfo.token?.attrs?.src || imageInfo.token?.src || ''
        if (typeof this.muya.options.elephantnoteCommandHandler === 'function') {
          this.muya.options.elephantnoteCommandHandler('edit-excalidraw-image', { src, imageInfo })
        } else {
          window.dispatchEvent(new CustomEvent('elephantnote-writing-command', {
            detail: {
              command: 'edit-excalidraw-image',
              payload: { src }
            }
          }))
        }
        return this.hide()
      }
      case 'inline':
      case 'left':
      case 'center':
      case 'right': {
        this.muya.contentState.updateImage(this.imageInfo, 'data-align', item.type)
        return this.hide()
      }
      case 'open': {
        if (isLocalImage) {
          this.muya.contentState.openImage(this.imageInfo)
          this.hide()
        }
        break
      }
    }
  }

  canEditWithExcalidraw(imageInfo) {
    if (!this.isLocalFile(imageInfo)) return false
    const src = imageInfo.token?.attrs?.src || imageInfo.token?.src || ''
    if (typeof this.muya.options.canEditExcalidrawImage === 'function') {
      return this.muya.options.canEditExcalidrawImage(src, imageInfo) === true
    }
    return true
  }

  isLocalFile(imageInfo) {
    const { attrs } = imageInfo.token
    if (URL_REG.test(imageInfo.token.src) || URL_REG.test(attrs.src)) {
      return false
    }
    return true
  }
}

export default ImageToolbar

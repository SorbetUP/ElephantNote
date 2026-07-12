import BaseFloat from '../baseFloat'
import { patch, h } from '../../parser/render/snabbdom'
import { EVENT_KEYS } from '../../config'
import translateImageSelector from './i18n'
import {
  chooseImage,
  handleSourceKeyDown,
  handleSourceKeyUp,
  listenImageSelector,
  replaceImageAsync
} from './actions'
import {
  renderImageSelectorBody,
  renderImageSelectorHeader
} from './render'
import './index.css'

class ImageSelector extends BaseFloat {
  static pluginName = 'imageSelector'

  constructor(muya, options) {
    const name = 'ag-image-selector'
    options = Object.assign(options, {
      placement: 'bottom',
      modifiers: { offset: { offset: '0, 0' } },
      showArrow: false
    })
    super(muya, name, options)
    this.renderArray = []
    this.oldVnode = null
    this.imageInfo = null
    this.photoList = []
    this.loading = false
    this.tab = 'link'
    this.isFullMode = false
    this.state = { alt: '', src: '', title: '' }
    const imageSelectorContainer = (this.imageSelectorContainer = document.createElement('div'))
    this.container.appendChild(imageSelectorContainer)
    this.floatBox.classList.add('ag-image-selector-wrapper')
    this.listen()
  }

  translate = key => translateImageSelector(this, key)

  listen() {
    super.listen()
    return listenImageSelector(this)
  }

  tabClick(event, tab) {
    this.tab = tab.value
    return this.render()
  }

  toggleMode() {
    this.isFullMode = !this.isFullMode
    return this.render()
  }

  inputHandler(event, type) {
    this.state[type] = event.target.value
  }

  handleKeyDown(event) {
    if (event.key === EVENT_KEYS.Enter) {
      event.stopPropagation()
      this.handleLinkButtonClick()
    }
  }

  srcInputKeyDown(event) {
    return handleSourceKeyDown(this, event)
  }

  async handleKeyUp(event) {
    return handleSourceKeyUp(this, event)
  }

  handleLinkButtonClick() {
    return this.replaceImageAsync(this.state)
  }

  replaceImageAsync = async image => replaceImageAsync(this, image)

  async handleSelectButtonClick() {
    return chooseImage(this)
  }

  renderHeader() {
    return renderImageSelectorHeader(this)
  }

  renderBody = () => renderImageSelectorBody(this)

  render() {
    const { oldVnode, imageSelectorContainer } = this
    const vnode = h('div', [this.renderHeader(), this.renderBody()])
    if (oldVnode) patch(oldVnode, vnode)
    else patch(imageSelectorContainer, vnode)
    this.oldVnode = vnode
  }
}

export default ImageSelector

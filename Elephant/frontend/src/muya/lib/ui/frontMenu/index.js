import BaseFloat from '../baseFloat'
import { createMenu, createGetSubMenu, createGetLabel } from './config'
import { renderFrontMenu, renderFrontSubMenu } from './view'

import './index.css'

const defaultOptions = {
  placement: 'bottom',
  modifiers: {
    offset: {
      offset: '0, 10'
    }
  },
  showArrow: false
}

class FrontMenu extends BaseFloat {
  static pluginName = 'frontMenu'

  constructor(muya, options = {}) {
    const name = 'ag-front-menu'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.outmostBlock = null
    this.startBlock = null
    this.endBlock = null
    this.options = opts
    this.reference = null
    this.t = opts.t || muya.options.t || ((key) => key)
    this.menu = createMenu(this.t)
    this.getLabel = createGetLabel(this.t)
    this.getSubMenu = createGetSubMenu(this.t)
    const frontMenuContainer = (this.frontMenuContainer = document.createElement('div'))
    Object.assign(this.container.parentNode.style, {
      overflow: 'visible'
    })
    this.container.appendChild(frontMenuContainer)
    this.listen()
  }

  listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe(
      'muya-front-menu',
      ({ reference, outmostBlock, startBlock, endBlock }) => {
        if (reference) {
          this.outmostBlock = outmostBlock
          this.startBlock = startBlock
          this.endBlock = endBlock
          this.reference = reference
          setTimeout(() => {
            this.show(reference)
            this.render()
          }, 0)
        } else {
          this.hide()
          this.reference = null
        }
      }
    )
  }

  renderSubMenu(subMenu) {
    return renderFrontSubMenu(this, subMenu)
  }

  render() {
    return renderFrontMenu(this)
  }

  selectItem(event, { label }) {
    event.preventDefault()
    event.stopPropagation()
    const { type, functionType } = this.outmostBlock
    if (label === 'duplicate' && type === 'pre' && functionType === 'frontmatter') {
      return
    }
    const { contentState } = this.muya
    contentState.selectedBlock = null
    switch (label) {
      case 'duplicate': {
        contentState.duplicate()
        break
      }
      case 'delete': {
        contentState.deleteParagraph()
        break
      }
      case 'new': {
        contentState.insertParagraph('after', '', true)
        break
      }
      case 'turnInto':
        return
      default:
        contentState.updateParagraph(label)
        break
    }
    setTimeout(this.hide.bind(this))
  }
}

export default FrontMenu

import { filter } from 'fuzzaldrin'
import { deepCopy } from '../../utils'
import BaseScrollFloat from '../baseScrollFloat'
import { createQuickInsertObj } from './config'
import { renderQuickInsert } from './view'
import './index.css'

const normalizeQuickInsertTrigger = (trigger) => {
  return typeof trigger === 'string' && trigger.trim() ? trigger.trim().charAt(0) : '/'
}

class QuickInsert extends BaseScrollFloat {
  static pluginName = 'quickInsert'

  constructor(muya) {
    const name = 'ag-quick-insert'
    super(muya, name)
    this.reference = null
    this.oldVnode = null
    this._renderObj = null
    this.renderArray = null
    this.activeItem = null
    this.block = null
    const translateFn = muya.options && muya.options.t ? muya.options.t : null
    this.originalQuickInsertObj = createQuickInsertObj(translateFn)
    this.renderObj = this.originalQuickInsertObj
    this.render()
    this.listen()
  }

  get renderObj() {
    return this._renderObj
  }

  set renderObj(obj) {
    this._renderObj = obj
    const renderArray = []
    Object.keys(obj).forEach((key) => {
      renderArray.push(...obj[key])
    })
    this.renderArray = renderArray
    if (this.renderArray.length > 0) {
      this.activeItem = this.renderArray[0]
      const activeEle = this.getItemElement(this.activeItem)
      this.activeEleScrollIntoView(activeEle)
    }
  }

  render() {
    return renderQuickInsert(this)
  }

  listen() {
    super.listen()
    const { eventCenter } = this.muya
    eventCenter.subscribe('muya-quick-insert', (reference, block, status) => {
      if (status) {
        this.block = block
        this.show(reference)
        const trigger = normalizeQuickInsertTrigger(this.muya.options.quickInsertTrigger)
        this.search(block.text.startsWith(trigger) ? block.text.substring(trigger.length) : block.text)
      } else {
        this.hide()
      }
    })
  }

  search(text) {
    const { contentState } = this.muya
    const canInserFrontMatter = contentState.canInserFrontMatter(this.block)
    const obj = deepCopy(this.originalQuickInsertObj)
    if (!canInserFrontMatter) {
      const basicBlockKey = Object.keys(obj).find((key) => {
        const items = obj[key]
        return Array.isArray(items) && items.some((item) => item.label === 'front-matter')
      })
      if (basicBlockKey && obj[basicBlockKey]) {
        const frontMatterIndex = obj[basicBlockKey].findIndex(
          (item) => item.label === 'front-matter'
        )
        if (frontMatterIndex !== -1) {
          obj[basicBlockKey].splice(frontMatterIndex, 1)
        }
      }
    }
    let result = obj
    if (text !== '') {
      result = {}
      Object.keys(obj).forEach((key) => {
        result[key] = filter(obj[key], text, { key: 'title' })
      })
    }
    this.renderObj = result
    this.render()
  }

  selectItem(item) {
    const { contentState } = this.muya
    if (!this.block) {
      console.warn('QuickInsert: block is null, cannot select item')
      this.hide()
      return
    }
    this.block.text = ''
    const { key } = this.block
    const offset = 0
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset }
    }

    if (item.label.startsWith('elephant-command ')) {
      contentState.partialRender()
      const command = item.label.replace('elephant-command ', '')

      if (typeof this.muya.options.elephantnoteCommandHandler === 'function') {
        setTimeout(() => {
          this.muya.options.elephantnoteCommandHandler(command)
        })
      }

      setTimeout(this.hide.bind(this))
      return
    }

    switch (item.label) {
      case 'paragraph':
        contentState.partialRender()
        break
      default:
        contentState.updateParagraph(item.label, true)
        break
    }
    setTimeout(this.hide.bind(this))
  }

  getItemElement(item) {
    const { label } = item
    return this.scrollElement.querySelector(`[data-label="${label}"]`)
  }
}

export default QuickInsert

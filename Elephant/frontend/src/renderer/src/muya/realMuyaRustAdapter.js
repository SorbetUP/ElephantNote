import Muya from '../../../muya/lib'
import { createRealMuyaRustMirror } from './realMuyaRustMirrorRuntime.js'

const historyIdentity = (history) => {
  if (!history || typeof history !== 'object') return ''
  const index = Number.isInteger(history.index) ? history.index : -1
  const lastEditIndex = Number.isInteger(history.lastEditIndex) ? history.lastEditIndex : -1
  if (index < 0 || lastEditIndex < 0) return ''
  return `${index}:${lastEditIndex}`
}

export default class RealMuyaWithRustMirror extends Muya {
  constructor (element, options = {}) {
    super(element, options)

    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustMirror = createRealMuyaRustMirror({
      initialMarkdown: options.markdown || '',
      target: globalThis
    })

    this.__elephantRustChangeListener = ({ markdown, muyaIndexCursor, history } = {}) => {
      if (typeof markdown !== 'string') return
      const nextHistoryIdentity = historyIdentity(history)
      const continueGroup = nextHistoryIdentity !== '' &&
        nextHistoryIdentity === this.__elephantRustHistoryIdentity
      this.__elephantRustHistoryIdentity = nextHistoryIdentity
      this.__elephantRustMirror.sync(markdown, 'muya-change', {
        muyaIndexCursor,
        continueGroup
      })
    }

    this.on('change', this.__elephantRustChangeListener)
  }

  setMarkdown (markdown, ...args) {
    const result = super.setMarkdown(markdown, ...args)
    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustMirror?.sync(markdown, 'set-markdown', {
      continueGroup: false
    })
    return result
  }

  destroy () {
    if (this.__elephantRustChangeListener) {
      this.off('change', this.__elephantRustChangeListener)
    }
    this.__elephantRustMirror?.destroy()
    this.__elephantRustMirror = null
    this.__elephantRustChangeListener = null
    this.__elephantRustHistoryIdentity = ''
    return super.destroy()
  }
}

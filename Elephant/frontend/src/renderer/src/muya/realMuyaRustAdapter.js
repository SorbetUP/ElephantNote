import Muya from '../../../muya/lib'
import { createRealMuyaRustMirror } from './realMuyaRustMirrorRuntime.js'

export default class RealMuyaWithRustMirror extends Muya {
  constructor (element, options = {}) {
    super(element, options)

    this.__elephantRustMirror = createRealMuyaRustMirror({
      initialMarkdown: options.markdown || '',
      target: globalThis
    })

    this.__elephantRustChangeListener = ({ markdown } = {}) => {
      if (typeof markdown !== 'string') return
      this.__elephantRustMirror.sync(markdown, 'muya-change')
    }

    this.on('change', this.__elephantRustChangeListener)
  }

  setMarkdown (markdown, ...args) {
    const result = super.setMarkdown(markdown, ...args)
    this.__elephantRustMirror?.sync(markdown, 'set-markdown')
    return result
  }

  destroy () {
    if (this.__elephantRustChangeListener) {
      this.off('change', this.__elephantRustChangeListener)
    }
    this.__elephantRustMirror?.destroy()
    this.__elephantRustMirror = null
    this.__elephantRustChangeListener = null
    return super.destroy()
  }
}

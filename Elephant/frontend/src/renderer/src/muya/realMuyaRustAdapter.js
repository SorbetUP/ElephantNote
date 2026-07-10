import Muya from '../../../muya/lib'
import {
  createRealMuyaRustMirror,
  selectionToMuyaIndexCursor
} from './realMuyaRustMirrorRuntime.js'

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
    this.__elephantRustExpectedMarkdown = null
    this.__elephantRustMirror = createRealMuyaRustMirror({
      initialMarkdown: options.markdown || '',
      target: globalThis
    })

    this.__elephantRustChangeListener = ({ markdown, muyaIndexCursor, history } = {}) => {
      if (typeof markdown !== 'string') return
      if (this.__elephantRustExpectedMarkdown === markdown) {
        this.__elephantRustExpectedMarkdown = null
        return
      }

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
    this.__elephantRustExpectedMarkdown = null
    const muyaIndexCursor = args[2]
    this.__elephantRustMirror?.reset(markdown, 'set-markdown', {
      muyaIndexCursor
    })
    return result
  }

  async __applyElephantRustHistory (action) {
    if (!this.__elephantRustMirror?.active) {
      return action === 'undo' ? super.undo() : super.redo()
    }

    try {
      const transaction = action === 'undo'
        ? await this.__elephantRustMirror.undo()
        : await this.__elephantRustMirror.redo()
      if (!transaction?.documentChanged) return transaction

      const { state } = transaction
      this.__elephantRustHistoryIdentity = ''
      this.__elephantRustExpectedMarkdown = state.markdown
      const muyaIndexCursor = selectionToMuyaIndexCursor(state.markdown, state.selection)
      super.setMarkdown(state.markdown, undefined, true, muyaIndexCursor)
      return transaction
    } catch (error) {
      console.error(`[elephantnote:muya-rust] ${action} failed; using Muya history`, error)
      return action === 'undo' ? super.undo() : super.redo()
    }
  }

  undo () {
    return this.__applyElephantRustHistory('undo')
  }

  redo () {
    return this.__applyElephantRustHistory('redo')
  }

  destroy () {
    if (this.__elephantRustChangeListener) {
      this.off('change', this.__elephantRustChangeListener)
    }
    this.__elephantRustMirror?.destroy()
    this.__elephantRustMirror = null
    this.__elephantRustChangeListener = null
    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustExpectedMarkdown = null
    return super.destroy()
  }
}

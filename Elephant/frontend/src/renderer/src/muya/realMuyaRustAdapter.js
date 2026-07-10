import Muya from '../../../muya/lib'
import {
  createRealMuyaRustMirror,
  selectionToMuyaIndexCursor
} from './realMuyaRustMirrorRuntime.js'

const RUST_INLINE_MARKERS = Object.freeze({
  strong: '**',
  em: '*',
  del: '~~',
  inline_code: '`'
})

const RUST_BLOCK_KINDS = Object.freeze({
  paragraph: 'paragraph',
  'reset-to-paragraph': 'paragraph',
  'heading 1': 'heading1',
  'heading 2': 'heading2',
  'heading 3': 'heading3',
  'heading 4': 'heading4',
  'heading 5': 'heading5',
  'heading 6': 'heading6',
  blockquote: 'quote',
  'ul-bullet': 'bullet',
  'ol-order': 'ordered',
  'ul-task': 'task'
})

const STRUCTURED_LINE = /^\s*(?:>|[-+*]\s|[-+*]\s+\[[ xX]\]\s|\d+[.)]\s)/
const HEADING_LINE = /^\s{0,3}#{1,6}\s/

const historyIdentity = (history) => {
  if (!history || typeof history !== 'object') return ''
  const index = Number.isInteger(history.index) ? history.index : -1
  const lastEditIndex = Number.isInteger(history.lastEditIndex) ? history.lastEditIndex : -1
  if (index < 0 || lastEditIndex < 0) return ''
  return `${index}:${lastEditIndex}`
}

const lineAt = (markdown, line) => String(markdown || '').split('\n')[line] || ''

const rustCanTransformLine = (type, line) => {
  const structured = STRUCTURED_LINE.test(line)
  const heading = HEADING_LINE.test(line)
  if (type === 'paragraph' || type === 'reset-to-paragraph') return heading || !structured
  if (/^heading [1-6]$/.test(type)) return heading || !structured
  if (['blockquote', 'ul-bullet', 'ol-order', 'ul-task'].includes(type)) {
    return !structured && !heading
  }
  return false
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

  __synchronizeElephantRustSelection () {
    const markdown = this.getMarkdown()
    const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
    return this.__elephantRustMirror.sync(markdown, 'pre-command', {
      muyaIndexCursor,
      continueGroup: false
    })
  }

  __renderElephantRustTransaction (transaction) {
    if (!transaction?.documentChanged) return transaction
    const { state } = transaction
    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustExpectedMarkdown = state.markdown
    const muyaIndexCursor = selectionToMuyaIndexCursor(state.markdown, state.selection)
    super.setMarkdown(state.markdown, undefined, true, muyaIndexCursor)
    super.clearHistory()
    return transaction
  }

  async __applyElephantRustCommand (name, operation, fallback) {
    if (!this.__elephantRustMirror?.active) return fallback()

    try {
      await this.__synchronizeElephantRustSelection()
      const transaction = await operation(this.__elephantRustMirror)
      return this.__renderElephantRustTransaction(transaction)
    } catch (error) {
      console.error(`[elephantnote:muya-rust] ${name} failed; using Muya command`, error)
      return fallback()
    }
  }

  undo () {
    return this.__applyElephantRustCommand(
      'undo',
      (engine) => engine.undo(),
      () => super.undo()
    )
  }

  redo () {
    return this.__applyElephantRustCommand(
      'redo',
      (engine) => engine.redo(),
      () => super.redo()
    )
  }

  format (type) {
    const marker = RUST_INLINE_MARKERS[type]
    if (!marker) return super.format(type)
    return this.__applyElephantRustCommand(
      `format-${type}`,
      (engine) => engine.toggleInline(marker),
      () => super.format(type)
    )
  }

  updateParagraph (type) {
    const kind = RUST_BLOCK_KINDS[type]
    if (!kind) return super.updateParagraph(type)

    const cursor = this.contentState.getMuyaIndexCursor()
    const isSingleLine = cursor?.anchor?.line === cursor?.focus?.line
    const markdown = this.getMarkdown()
    const currentLine = isSingleLine ? lineAt(markdown, cursor.anchor.line) : ''
    if (!isSingleLine || !rustCanTransformLine(type, currentLine)) {
      return super.updateParagraph(type)
    }

    return this.__applyElephantRustCommand(
      `paragraph-${type}`,
      (engine) => engine.transformBlock(kind),
      () => super.updateParagraph(type)
    )
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

import { editorCommands } from '../bridge'
import { markdownFromClipboard } from './clipboard'
import { commandForBeforeInput, commandForTableKey } from './commands'
import { readDomSelection } from './selection'

const noop = () => {}
const utf16Length = (value) => String(value || '').length

const orderedSameNodeSelection = (selection) => {
  if (selection.anchor.node !== selection.focus.node) return selection
  const start = Math.min(selection.anchor.offset_utf16, selection.focus.offset_utf16)
  const end = Math.max(selection.anchor.offset_utf16, selection.focus.offset_utf16)
  return {
    anchor: { node: selection.anchor.node, offset_utf16: start },
    focus: { node: selection.anchor.node, offset_utf16: end }
  }
}

export class MuyaRustInputController {
  constructor(container, bridge, renderer, options = {}) {
    if (!container?.addEventListener) {
      throw new TypeError('Rust input controller requires a DOM container.')
    }
    if (!bridge?.dispatch || !bridge?.setSelection) {
      throw new TypeError('Rust input controller requires a MuyaRustBridge.')
    }
    if (!renderer?.logical) throw new TypeError('Rust input controller requires a DOM renderer.')

    this.container = container
    this.bridge = bridge
    this.renderer = renderer
    this.onError = options.onError || noop
    this.composition = null
    this.attached = false
    this._tail = Promise.resolve()
    this._beforeInput = (event) => this.handleBeforeInput(event)
    this._paste = (event) => this.handlePaste(event)
    this._compositionStart = () => this.handleCompositionStart()
    this._compositionEnd = (event) => this.handleCompositionEnd(event)
    this._keyDown = (event) => this.handleKeyDown(event)
  }

  attach() {
    if (this.attached) return this
    this.attached = true
    this.container.addEventListener('beforeinput', this._beforeInput)
    this.container.addEventListener('paste', this._paste)
    this.container.addEventListener('compositionstart', this._compositionStart)
    this.container.addEventListener('compositionend', this._compositionEnd)
    this.container.addEventListener('keydown', this._keyDown)
    return this
  }

  detach() {
    if (!this.attached) return this
    this.attached = false
    this.container.removeEventListener('beforeinput', this._beforeInput)
    this.container.removeEventListener('paste', this._paste)
    this.container.removeEventListener('compositionstart', this._compositionStart)
    this.container.removeEventListener('compositionend', this._compositionEnd)
    this.container.removeEventListener('keydown', this._keyDown)
    return this
  }

  idle() {
    return this._tail
  }

  handleBeforeInput(event) {
    if (event.inputType === 'insertCompositionText') {
      if (!this.composition) this.startComposition()
      event.preventDefault()
      this.replaceComposition(event.data || '')
      return
    }

    const command = commandForBeforeInput(event)
    if (!command) return
    const selection = this.readSelection()
    if (!selection) return
    event.preventDefault()
    this.schedule(async () => {
      await this.bridge.setSelection(selection)
      await this.bridge.dispatch(command)
    })
  }

  handlePaste(event) {
    const selection = this.readSelection()
    if (!selection) return
    const markdown = markdownFromClipboard(event, this.container.ownerDocument)
    if (markdown === null) return
    event.preventDefault()
    event.stopPropagation?.()
    this.schedule(async () => {
      await this.bridge.setSelection(selection)
      await this.bridge.dispatch(editorCommands.pasteMarkdown(markdown))
    })
  }

  handleCompositionStart() {
    this.startComposition()
  }

  handleCompositionEnd(event) {
    if (!this.composition) return
    const finalText = event.data || ''
    if (finalText !== this.composition.text) this.replaceComposition(finalText)
    this.composition = null
    this.schedule(() => this.bridge.dispatch(editorCommands.commitComposition()))
  }

  handleKeyDown(event) {
    if (event.key === 'Escape' && this.composition) {
      event.preventDefault()
      this.composition = null
      this.schedule(() => this.bridge.dispatch(editorCommands.cancelComposition()))
      return
    }
    if (event.key !== 'Tab') return

    const selection = this.readSelection()
    if (!selection) return
    const command = commandForTableKey(event, this.renderer, selection)
    if (!command) return
    event.preventDefault()
    this.schedule(async () => {
      await this.bridge.setSelection(selection)
      await this.bridge.dispatch(command)
    })
  }

  startComposition() {
    if (this.composition) return
    const selection = this.readSelection()
    if (!selection) return
    const range = orderedSameNodeSelection(selection)
    this.composition = { range, text: '' }
    this.schedule(async () => {
      await this.bridge.setSelection(range)
      await this.bridge.dispatch(editorCommands.beginComposition())
    })
  }

  replaceComposition(text) {
    const composition = this.composition
    if (!composition) return
    const range = composition.range
    const start = range.anchor
    composition.text = text
    composition.range = {
      anchor: start,
      focus: { node: start.node, offset_utf16: start.offset_utf16 + utf16Length(text) }
    }
    this.schedule(async () => {
      await this.bridge.setSelection(range)
      await this.bridge.dispatch(editorCommands.updateComposition(text))
    })
  }

  readSelection() {
    try {
      return readDomSelection(this.renderer)
    } catch (error) {
      this.onError(error)
      return null
    }
  }

  schedule(task) {
    const result = this._tail.then(task)
    this._tail = result.catch((error) => this.onError(error))
    result.catch(noop)
    return result
  }
}

export const createRustInputController = (container, bridge, renderer, options) =>
  new MuyaRustInputController(container, bridge, renderer, options).attach()

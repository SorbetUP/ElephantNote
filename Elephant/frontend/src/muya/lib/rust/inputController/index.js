import { editorCommands } from '../bridge'
import { markdownFromClipboard } from './clipboard'
import {
  cancelComposition,
  finishComposition,
  replaceComposition,
  startComposition
} from './composition'
import { commandForBeforeInput, commandForTableKey } from './commands'
import { handleCopy, handleCut } from './copyCut'
import { handleDeleteForward } from './deleteForward'
import { DELETE_UNIT_INPUTS, handleDeleteUnit } from './deleteUnits'
import { handleDragOver, handleDrop } from './drop'
import { readDomSelection } from './selection'
import { handleTaskClick } from './task'

const noop = () => {}

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
    this.onFileDrop = typeof options.onFileDrop === 'function' ? options.onFileDrop : null
    this.autoCheck = Boolean(options.autoCheck)
    this.composition = null
    this.attached = false
    this._tail = Promise.resolve()
    this._beforeInput = (event) => this.handleBeforeInput(event)
    this._click = (event) => this.handleClick(event)
    this._copy = (event) => this.handleCopy(event)
    this._cut = (event) => this.handleCut(event)
    this._paste = (event) => this.handlePaste(event)
    this._dragOver = (event) => this.handleDragOver(event)
    this._drop = (event) => this.handleDrop(event)
    this._compositionStart = () => this.handleCompositionStart()
    this._compositionEnd = (event) => this.handleCompositionEnd(event)
    this._keyDown = (event) => this.handleKeyDown(event)
  }

  attach() {
    if (this.attached) return this
    this.attached = true
    this.container.addEventListener('beforeinput', this._beforeInput)
    this.container.addEventListener('click', this._click)
    this.container.addEventListener('copy', this._copy)
    this.container.addEventListener('cut', this._cut)
    this.container.addEventListener('paste', this._paste)
    this.container.addEventListener('dragover', this._dragOver)
    this.container.addEventListener('drop', this._drop)
    this.container.addEventListener('compositionstart', this._compositionStart)
    this.container.addEventListener('compositionend', this._compositionEnd)
    this.container.addEventListener('keydown', this._keyDown)
    return this
  }

  detach() {
    if (!this.attached) return this
    this.attached = false
    this.container.removeEventListener('beforeinput', this._beforeInput)
    this.container.removeEventListener('click', this._click)
    this.container.removeEventListener('copy', this._copy)
    this.container.removeEventListener('cut', this._cut)
    this.container.removeEventListener('paste', this._paste)
    this.container.removeEventListener('dragover', this._dragOver)
    this.container.removeEventListener('drop', this._drop)
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
      if (!this.composition) startComposition(this)
      event.preventDefault()
      replaceComposition(this, event.data || '')
      return
    }

    const selection = this.readSelection()
    if (!selection) return
    if (event.inputType === 'deleteContentForward') {
      handleDeleteForward(this, event, selection)
      return
    }
    if (DELETE_UNIT_INPUTS.has(event.inputType)) {
      handleDeleteUnit(this, event, selection)
      return
    }

    const command = commandForBeforeInput(event)
    if (!command) return
    event.preventDefault()
    this.schedule(async () => {
      await this.bridge.setSelection(selection)
      await this.bridge.dispatch(command)
    })
  }

  handleClick(event) {
    return handleTaskClick(this, event)
  }

  handleCopy(event) {
    return handleCopy(this, event)
  }

  handleCut(event) {
    return handleCut(this, event)
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

  handleDragOver(event) {
    return handleDragOver(this, event)
  }

  handleDrop(event) {
    return handleDrop(this, event)
  }

  handleCompositionStart() {
    startComposition(this)
  }

  handleCompositionEnd(event) {
    finishComposition(this, event)
  }

  handleKeyDown(event) {
    if (event.key === 'Escape' && cancelComposition(this)) {
      event.preventDefault()
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

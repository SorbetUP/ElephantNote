import Muya from '../../../muya/lib'
import { correctImageSrc } from '../../../muya/lib/utils/getImageInfo'
import {
  createRealMuyaRustMirror,
  muyaIndexCursorToSelection,
  selectionToMuyaIndexCursor
} from './realMuyaRustMirrorRuntime.js'

const INLINE_MARKERS = Object.freeze({
  strong: '**',
  em: '*',
  del: '~~',
  inline_code: '`',
  highlight: '=='
})

const BLOCK_KINDS = Object.freeze({
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

const TABLE_SEPARATOR = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/
const encodeImageSource = (source) => String(source || '')
  .replace(/ /g, encodeURI(' '))
  .replace(/#/g, encodeURIComponent('#'))

const markdownTables = (markdown) => {
  const lines = String(markdown || '').split('\n')
  const tables = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\s*\|.*\|\s*$/.test(lines[index]) || !TABLE_SEPARATOR.test(lines[index + 1])) continue
    let end = index + 1
    while (end + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[end + 1])) end += 1
    tables.push({ start: index, end })
    index = end
  }
  return { lines, tables }
}

const imageHtml = (token, attrName, attrValue) => {
  const attrs = Object.assign({}, token?.attrs || {})
  attrs[attrName] = attrValue
  let result = '<img '
  for (const attr of Object.keys(attrs)) {
    let value = attrs[attr]
    if (value && attr === 'src') value = correctImageSrc(value)
    result += `${attr}="${value}" `
  }
  return `${result.trim()}>`
}

const clipboardHasImage = (event) => {
  const items = event?.clipboardData?.items
  return Boolean(items && Array.from(items).some((item) => String(item?.type || '').startsWith('image/')))
}

const lineAt = (markdown, line) => String(markdown || '').split('\n')[line] || ''

export default class RealMuyaWithRustCore extends Muya {
  constructor (element, options = {}) {
    super(element, options)
    this.__rustExpectedMarkdown = null
    this.__rustApplying = false
    this.__rustComposition = null
    this.__rustClipboard = { markdown: '', html: '' }
    this.__rustMirror = createRealMuyaRustMirror({
      initialMarkdown: options.markdown || '',
      target: globalThis
    })

    this.__installRustHooks()
    this.__installRustDomEvents()

    this.__rustChangeListener = ({ markdown, muyaIndexCursor } = {}) => {
      if (typeof markdown !== 'string') return
      if (this.__rustExpectedMarkdown === markdown) {
        this.__rustExpectedMarkdown = null
        return
      }
      if (this.__rustComposition) {
        this.__rustComposition.finalMarkdown = markdown
        this.__rustComposition.finalCursor = muyaIndexCursor
        return
      }
      if (this.__rustApplying) return
      const canonical = this.__rustMirror?.state?.markdown
      if (this.__rustMirror?.active && typeof canonical === 'string' && canonical !== markdown) {
        console.error('[elephantnote:muya-rust] rejected JavaScript-side document mutation')
        this.__rustExpectedMarkdown = canonical
        super.setMarkdown(
          canonical,
          undefined,
          true,
          selectionToMuyaIndexCursor(canonical, this.__rustMirror.state.selection)
        )
      }
    }

    this.__rustSelectionListener = () => {
      if (!this.__rustMirror?.active || this.__rustApplying || this.__rustComposition) return
      const markdown = this.getMarkdown()
      const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
      this.__rustMirror.sync(markdown, 'selection-change', {
        muyaIndexCursor,
        continueGroup: false
      }).then(() => this.__refreshRustClipboard()).catch(this.__reportRustError)
    }

    this.on('change', this.__rustChangeListener)
    this.on('selectionChange', this.__rustSelectionListener)
  }

  __reportRustError = (error) => {
    console.error('[elephantnote:muya-rust] canonical command failed', error)
    this.eventCenter.dispatch('crashed', {
      engine: 'rust',
      error: error instanceof Error ? error.message : String(error)
    })
  }

  __requireRust () {
    if (!this.__rustMirror?.active) {
      throw new Error('The canonical Rust editor is required; JavaScript Muya fallback is disabled.')
    }
    return this.__rustMirror
  }

  __currentSelection () {
    const markdown = this.getMarkdown()
    const cursor = this.contentState.getMuyaIndexCursor()
    return {
      markdown,
      cursor,
      selection: muyaIndexCursorToSelection(markdown, cursor)
    }
  }

  async __applyRust (name, operation) {
    const engine = this.__requireRust()
    this.__rustApplying = true
    try {
      const { markdown, cursor } = this.__currentSelection()
      await engine.sync(markdown, `pre-${name}`, {
        muyaIndexCursor: cursor,
        continueGroup: false
      })
      const transaction = await operation(engine)
      return this.__renderRustTransaction(transaction)
    } catch (error) {
      this.__reportRustError(error)
      throw error
    } finally {
      this.__rustApplying = false
    }
  }

  __renderRustTransaction (transaction) {
    if (!transaction?.state) return transaction
    const { state } = transaction
    if (!transaction.documentChanged && !transaction.selectionChanged) return transaction
    this.__rustExpectedMarkdown = state.markdown
    const cursor = selectionToMuyaIndexCursor(state.markdown, state.selection)
    super.setMarkdown(state.markdown, undefined, true, cursor)
    super.clearHistory()
    return transaction
  }

  __installRustHooks () {
    this.contentState.updateParagraph = (type) => this.updateParagraph(type)
    this.contentState.editTable = (data, key) => this.__editTable(data, key)
    this.contentState.updateImage = (imageInfo, attrName, attrValue) => (
      this.__updateImage(imageInfo, attrName, attrValue)
    )
    this.contentState.deleteImage = (imageInfo) => this.__deleteImage(imageInfo)
    this.contentState.createFootnote = (identifier) => this.__createFootnote(identifier)
    this.contentState.pasteHandler = (event, type = 'normal', text, html) => (
      this.__paste(event, type, text, html)
    )
    this.contentState.enterHandler = (event) => this.__enter(event)
    this.contentState.tabHandler = (event) => this.__tab(event)
    this.contentState.backspaceHandler = (event) => this.__backspace(event)
    this.contentState.docBackspaceHandler = (event) => this.__backspace(event)
    this.contentState.deleteHandler = (event) => this.__deleteForward(event)
    this.contentState.inputHandler = () => undefined
    this.contentState.duplicate = () => this.duplicate()
    this.contentState.deleteParagraph = () => this.deleteParagraph()
    this.contentState.insertParagraph = (location, text = '') => this.insertParagraph(location, text)
  }

  __installRustDomEvents () {
    this.__beforeInputListener = (event) => this.__beforeInput(event)
    this.__pasteListener = (event) => this.__paste(event)
    this.__dropListener = (event) => this.__drop(event)
    this.__copyListener = (event) => this.__copy(event)
    this.__cutListener = (event) => this.__cut(event)
    this.__compositionStartListener = () => this.__compositionStart()
    this.__compositionEndListener = (event) => this.__compositionEnd(event)
    this.container.addEventListener('beforeinput', this.__beforeInputListener, true)
    this.container.addEventListener('paste', this.__pasteListener, true)
    this.container.addEventListener('drop', this.__dropListener, true)
    this.container.addEventListener('copy', this.__copyListener, true)
    this.container.addEventListener('cut', this.__cutListener, true)
    this.container.addEventListener('compositionstart', this.__compositionStartListener, true)
    this.container.addEventListener('compositionend', this.__compositionEndListener, true)
  }

  __beforeInput (event) {
    if (!this.__rustMirror?.active || this.__rustComposition) return
    const inputType = String(event.inputType || '')
    const text = event.data == null ? '' : String(event.data)
    const operations = {
      insertText: (engine) => {
        const { selection } = this.__currentSelection()
        return engine.replaceRange(selection.anchor, selection.focus, text)
      },
      insertParagraph: (engine) => {
        const { selection } = this.__currentSelection()
        return engine.replaceRange(selection.anchor, selection.focus, '\n')
      },
      insertLineBreak: (engine) => {
        const { selection } = this.__currentSelection()
        return engine.replaceRange(selection.anchor, selection.focus, '\n')
      },
      deleteContentBackward: (engine) => engine.deleteBackward(),
      deleteContentForward: (engine) => engine.deleteForward(),
      deleteByCut: (engine) => {
        const { selection } = this.__currentSelection()
        return engine.replaceRange(selection.anchor, selection.focus, '')
      },
      historyUndo: (engine) => engine.undo(),
      historyRedo: (engine) => engine.redo(),
      formatBold: (engine) => engine.toggleInline('**'),
      formatItalic: (engine) => engine.toggleInline('*'),
      formatStrikeThrough: (engine) => engine.toggleInline('~~')
    }
    const operation = operations[inputType]
    if (!operation || inputType === 'insertFromPaste' || inputType === 'insertCompositionText') return
    event.preventDefault()
    event.stopPropagation()
    this.__applyRust(`beforeinput-${inputType}`, operation).catch(this.__reportRustError)
  }

  __backspace (event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyRust('backspace', (engine) => engine.deleteBackward())
  }

  __deleteForward (event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyRust('delete-forward', (engine) => engine.deleteForward())
  }

  __enter (event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyRust('enter', async(engine) => {
      const transaction = await engine.keyboardRule('Enter')
      if (transaction.documentChanged) return transaction
      const { selection } = this.__currentSelection()
      return engine.replaceRange(selection.anchor, selection.focus, '\n')
    })
  }

  __tab (event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyRust('tab', (engine) => engine.indentSelection({
      outdent: Boolean(event?.shiftKey),
      width: Number(this.contentState.tabSize) || 2
    }))
  }

  __paste (event, type = 'normal', rawText, rawHtml) {
    if (clipboardHasImage(event)) {
      this.__reportRustError(new Error('Binary image paste must be imported through the attachment service.'))
      return
    }
    const text = String(rawText ?? event?.clipboardData?.getData?.('text/plain') ?? '').replace(/\r/g, '')
    const sourceHtml = String(rawHtml ?? event?.clipboardData?.getData?.('text/html') ?? '').replace(/\r/g, '')
    const html = type === 'pasteAsPlainText' ? '' : sourceHtml
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyRust('paste', (engine) => engine.pasteClipboard(html, text))
  }

  __drop (event) {
    const text = String(event?.dataTransfer?.getData?.('text/plain') || '')
    if (!text) return
    event.preventDefault()
    event.stopPropagation()
    return this.__applyRust('drop', (engine) => {
      const { selection } = this.__currentSelection()
      return engine.replaceRange(selection.anchor, selection.focus, text)
    })
  }

  async __refreshRustClipboard () {
    if (typeof this.__rustMirror?.clipboard !== 'function') return
    this.__rustClipboard = await this.__rustMirror.clipboard()
  }

  __copy (event) {
    const payload = this.__rustClipboard || { markdown: '', html: '' }
    if (!payload.markdown && !payload.html) return
    event.preventDefault()
    event.clipboardData?.setData?.('text/plain', payload.markdown || '')
    event.clipboardData?.setData?.('text/html', payload.html || '')
  }

  __cut (event) {
    this.__copy(event)
    const { selection } = this.__currentSelection()
    if (selection.anchor === selection.focus) return
    this.__applyRust('cut', (engine) => (
      engine.replaceRange(selection.anchor, selection.focus, '')
    )).catch(this.__reportRustError)
  }

  __compositionStart () {
    if (!this.__rustMirror?.active || this.__rustComposition) return
    const { markdown, cursor, selection } = this.__currentSelection()
    this.__rustComposition = {
      markdown,
      cursor,
      selection,
      finalMarkdown: markdown,
      finalCursor: cursor
    }
  }

  __compositionEnd (event) {
    const composition = this.__rustComposition
    if (!composition) return
    this.__rustComposition = null
    const text = String(event?.data || '')
    this.__applyRust('composition', (engine) => (
      engine.commitComposition(composition.selection, text)
    )).catch(this.__reportRustError)
  }

  __tableContext (data, cellContentKey) {
    const { start, end } = this.contentState.cursor || {}
    if (!cellContentKey && (!start || !end || start.key !== end.key)) {
      throw new Error('Rust table command requires a single active cell.')
    }
    const block = this.contentState.getBlock(cellContentKey || start.key)
    if (block?.functionType !== 'cellContent') throw new Error('Rust table command requires a table cell.')
    const cell = this.contentState.getParent(block)
    const row = this.contentState.getParent(cell)
    const table = this.contentState.closest(block, 'table')
    const body = table?.children?.[1]
    const column = row?.children?.indexOf(cell)
    const visualRow = cell?.type === 'th' ? 0 : (body?.children?.indexOf(row) ?? -1) + 1
    if (!table || !Number.isInteger(column) || column < 0 || visualRow < 0) {
      throw new Error('Unable to resolve the active Rust table position.')
    }
    const parsed = markdownTables(this.getMarkdown())
    if (parsed.tables.length !== 1) {
      throw new Error('Multiple-table editing is not yet addressable by the table toolbar.')
    }
    if (data?.target === 'row') {
      if (visualRow === 0) throw new Error('The Markdown table header cannot be deleted as a body row.')
      const index = visualRow - 1
      if (data.action === 'insert') {
        return { action: 'insert_row', index: data.location === 'previous' ? index : index + 1 }
      }
      if (data.action === 'remove') return { action: 'delete_row', index }
    }
    if (data?.target === 'column') {
      if (data.action === 'insert') {
        return { action: 'insert_column', index: data.location === 'left' ? column : column + 1 }
      }
      if (data.action === 'remove') return { action: 'delete_column', index: column }
    }
    throw new Error('Unsupported Rust table command.')
  }

  __editTable (data, cellContentKey) {
    const context = this.__tableContext(data, cellContentKey)
    return this.__applyRust(`table-${context.action}`, (engine) => (
      engine.tableCommand(context.action, context.index)
    ))
  }

  __imageRange (imageInfo) {
    const token = imageInfo?.token
    const range = token?.range
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) {
      throw new Error('Rust image command requires a token range.')
    }
    const { selection } = this.__currentSelection()
    const count = Math.max(0, range.end - range.start)
    const end = selection.focus
    const start = Math.max(0, end - count)
    return { start, end }
  }

  __updateImage (imageInfo, attrName, attrValue) {
    if (!['width', 'data-align', 'src', 'alt', 'title'].includes(attrName)) {
      throw new Error(`Unsupported Rust image attribute: ${attrName}`)
    }
    const replacement = imageHtml(imageInfo?.token, attrName, attrValue)
    const range = this.__imageRange(imageInfo)
    return this.__applyRust(`image-${attrName}`, (engine) => (
      engine.replaceRange(range.start, range.end, replacement)
    ))
  }

  __deleteImage (imageInfo) {
    const range = this.__imageRange(imageInfo)
    return this.__applyRust('image-delete', (engine) => (
      engine.replaceRange(range.start, range.end, '')
    ))
  }

  __createFootnote (identifier) {
    const label = String(identifier || '')
    if (!label || /[\]\r\n]/.test(label)) throw new Error('Invalid Rust footnote label.')
    return this.__applyRust('footnote-create', (engine) => engine.upsertFootnote(label, ''))
  }

  setMarkdown (markdown, ...args) {
    const result = super.setMarkdown(markdown, ...args)
    this.__rustExpectedMarkdown = null
    this.__rustComposition = null
    const cursor = args[2]
    this.__rustMirror?.reset(markdown, 'set-markdown', { muyaIndexCursor: cursor })
      .then(() => this.__refreshRustClipboard())
      .catch(this.__reportRustError)
    return result
  }

  undo () {
    return this.__applyRust('undo', (engine) => engine.undo())
  }

  redo () {
    return this.__applyRust('redo', (engine) => engine.redo())
  }

  format (type) {
    const marker = INLINE_MARKERS[type]
    if (!marker) throw new Error(`Unsupported Rust inline format: ${type}`)
    return this.__applyRust(`format-${type}`, (engine) => engine.toggleInline(marker))
  }

  updateParagraph (type) {
    const kind = BLOCK_KINDS[type]
    if (!kind) throw new Error(`Unsupported Rust block transformation: ${type}`)
    return this.__applyRust(`paragraph-${type}`, (engine) => engine.transformBlock(kind))
  }

  duplicate () {
    return this.__applyRust('duplicate-block', (engine) => engine.duplicateBlock())
  }

  deleteParagraph () {
    return this.__applyRust('delete-block', (engine) => engine.deleteBlock())
  }

  insertParagraph (location, text = '') {
    return this.__applyRust(`insert-paragraph-${location}`, (engine) => (
      engine.insertParagraph(location, text)
    ))
  }

  editTable (data) {
    return this.__editTable(data)
  }

  createTable ({ rows = 2, columns = 2 } = {}) {
    const width = Math.max(1, Number(columns) || 1)
    const height = Math.max(2, Number(rows) || 2)
    const row = `| ${Array(width).fill('').join(' | ')} |`
    const separator = `| ${Array(width).fill('-').join(' | ')} |`
    const markdown = [row, separator, ...Array(height - 1).fill(row)].join('\n')
    const { selection } = this.__currentSelection()
    return this.__applyRust('create-table', (engine) => (
      engine.replaceRange(selection.anchor, selection.focus, markdown)
    ))
  }

  insertImage ({ alt = '', src = '', title = '' } = {}) {
    const source = encodeImageSource(src)
    const sourceAndTitle = title ? `${source} "${title}"` : source
    const markdown = `![${alt}](${sourceAndTitle})`
    const { selection } = this.__currentSelection()
    return this.__applyRust('image-insert', (engine) => (
      engine.replaceRange(selection.anchor, selection.focus, markdown)
    ))
  }

  selectAll () {
    return this.__applyRust('select-all', (engine) => engine.selectAll())
  }

  replace (value, options = {}) {
    return this.__applyRust('replace', (engine) => engine.searchReplace({
      query: value,
      replacement: options.replaceValue || options.replacement || '',
      replaceAll: Boolean(options.all || options.replaceAll),
      caseSensitive: Boolean(options.caseSensitive),
      wholeWord: Boolean(options.wholeWord)
    }))
  }

  search (value, options = {}) {
    this.__rustSearch = {
      value: String(value || ''),
      options: { ...options },
      index: -1
    }
    return []
  }

  find (action) {
    if (!this.__rustSearch?.value) return []
    this.__rustSearch.index += action === 'pre' ? -1 : 1
    return []
  }

  copyAsRich () {
    return this.__refreshRustClipboard()
  }

  copyAsHtml () {
    return this.__refreshRustClipboard()
  }

  pasteAsPlainText () {
    throw new Error('Paste as plain text must be initiated by a clipboard event.')
  }

  destroy () {
    this.off('change', this.__rustChangeListener)
    this.off('selectionChange', this.__rustSelectionListener)
    this.container.removeEventListener('beforeinput', this.__beforeInputListener, true)
    this.container.removeEventListener('paste', this.__pasteListener, true)
    this.container.removeEventListener('drop', this.__dropListener, true)
    this.container.removeEventListener('copy', this.__copyListener, true)
    this.container.removeEventListener('cut', this.__cutListener, true)
    this.container.removeEventListener('compositionstart', this.__compositionStartListener, true)
    this.container.removeEventListener('compositionend', this.__compositionEndListener, true)
    this.__rustMirror?.destroy()
    return super.destroy()
  }
}

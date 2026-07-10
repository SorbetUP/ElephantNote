import Muya from '../../../muya/lib'
import { correctImageSrc } from '../../../muya/lib/utils/getImageInfo'
import {
  createRealMuyaRustMirror,
  muyaIndexCursorToSelection,
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
const INLINE_BLOCK_TYPES = /paragraphContent|cellContent|atxLine/
const RUST_PASTE_BLOCK_TYPES = /paragraphContent|atxLine/
const TABLE_SEPARATOR = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/
const URL_ONLY = /^\S+:\/\/\S+$/
const SIMPLE_LIST_LINE = /^\s*(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)\S/

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

const markdownTables = (markdown) => {
  const lines = String(markdown || '').split('\n')
  const tables = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\s*\|.*\|\s*$/.test(lines[index]) || !TABLE_SEPARATOR.test(lines[index + 1])) {
      continue
    }
    let end = index + 1
    while (end + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[end + 1])) {
      end += 1
    }
    tables.push({ start: index, end })
    index = end
  }
  return { lines, tables }
}

const tableCellOffset = (markdown, table, row, column) => {
  const { lines } = markdownTables(markdown)
  const lineIndex = row === 0 ? table.start : table.start + row + 1
  const line = lines[lineIndex]
  if (typeof line !== 'string') return null

  const firstPipe = line.indexOf('|')
  if (firstPipe < 0) return null
  let currentColumn = 0
  let segmentStart = firstPipe + 1
  let columnOffset = null
  for (let index = firstPipe + 1; index < line.length; index += 1) {
    if (line[index] !== '|') continue
    if (currentColumn === column) {
      const segment = line.slice(segmentStart, index)
      columnOffset = segmentStart + (segment.length - segment.trimStart().length)
      break
    }
    currentColumn += 1
    segmentStart = index + 1
  }
  if (columnOffset == null) return null

  let offset = columnOffset
  for (let index = 0; index < lineIndex; index += 1) {
    offset += lines[index].length + 1
  }
  return offset
}

const encodeImageSource = (source) => String(source || '')
  .replace(/ /g, encodeURI(' '))
  .replace(/#/g, encodeURIComponent('#'))

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
  if (!items) return false
  return Array.from(items).some((item) => String(item?.type || '').startsWith('image/'))
}

export default class RealMuyaWithRustMirror extends Muya {
  constructor (element, options = {}) {
    super(element, options)

    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustExpectedMarkdown = null
    this.__elephantRustComposition = null
    this.__elephantRustMirror = createRealMuyaRustMirror({
      initialMarkdown: options.markdown || '',
      target: globalThis
    })
    this.__elephantRustOriginalContentState = {
      updateParagraph: this.contentState.updateParagraph.bind(this.contentState),
      editTable: this.contentState.editTable.bind(this.contentState),
      updateImage: this.contentState.updateImage.bind(this.contentState),
      deleteImage: this.contentState.deleteImage.bind(this.contentState),
      createFootnote: this.contentState.createFootnote.bind(this.contentState),
      pasteHandler: this.contentState.pasteHandler.bind(this.contentState),
      enterHandler: this.contentState.enterHandler.bind(this.contentState),
      tabHandler: this.contentState.tabHandler.bind(this.contentState)
    }
    this.__installElephantRustContentStateHooks()

    this.__elephantRustChangeListener = ({ markdown, muyaIndexCursor, history } = {}) => {
      if (typeof markdown !== 'string') return
      if (this.__elephantRustExpectedMarkdown === markdown) {
        this.__elephantRustExpectedMarkdown = null
        return
      }
      if (this.__elephantRustComposition) {
        this.__elephantRustComposition.finalMarkdown = markdown
        this.__elephantRustComposition.finalCursor = muyaIndexCursor
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

    this.__elephantRustSelectionListener = () => {
      if (
        !this.__elephantRustMirror?.active ||
        this.__elephantRustExpectedMarkdown !== null ||
        this.__elephantRustComposition
      ) return
      const markdown = this.getMarkdown()
      const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
      this.__elephantRustMirror.sync(markdown, 'selection-change', {
        muyaIndexCursor,
        continueGroup: false
      })
    }

    this.__elephantRustCompositionStartListener = () => {
      if (!this.__elephantRustMirror?.active || this.__elephantRustComposition) return
      const markdown = this.getMarkdown()
      const muyaIndexCursor = this.contentState.getMuyaIndexCursor()
      const selection = muyaIndexCursorToSelection(markdown, muyaIndexCursor)
      this.__elephantRustComposition = {
        markdown,
        selection,
        finalMarkdown: markdown,
        finalCursor: muyaIndexCursor
      }
      this.__elephantRustMirror.sync(markdown, 'ime-composition-start', {
        selection,
        continueGroup: false
      })
    }

    this.__elephantRustCompositionEndListener = (event) => {
      this.__commitElephantRustComposition(event)
    }

    this.on('change', this.__elephantRustChangeListener)
    this.on('selectionChange', this.__elephantRustSelectionListener)
    this.container.addEventListener('compositionstart', this.__elephantRustCompositionStartListener)
    this.container.addEventListener('compositionend', this.__elephantRustCompositionEndListener)
  }

  __installElephantRustContentStateHooks () {
    this.contentState.updateParagraph = (type, ...args) => (
      this.__updateParagraphThroughRust(type, args)
    )
    this.contentState.editTable = (data, cellContentKey) => (
      this.__editTableThroughRust(data, cellContentKey)
    )
    this.contentState.updateImage = (imageInfo, attrName, attrValue) => (
      this.__updateImageThroughRust(imageInfo, attrName, attrValue)
    )
    this.contentState.deleteImage = (imageInfo) => (
      this.__deleteImageThroughRust(imageInfo)
    )
    this.contentState.createFootnote = (identifier) => (
      this.__createFootnoteThroughRust(identifier)
    )
    this.contentState.pasteHandler = (event, type = 'normal', rawText, rawHtml) => (
      this.__pasteThroughRust(event, type, rawText, rawHtml)
    )
    this.contentState.enterHandler = (event) => this.__enterThroughRust(event)
    this.contentState.tabHandler = (event) => this.__tabThroughRust(event)
  }

  setMarkdown (markdown, ...args) {
    const result = super.setMarkdown(markdown, ...args)
    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustExpectedMarkdown = null
    this.__elephantRustComposition = null
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

  __commitElephantRustComposition (event) {
    const composition = this.__elephantRustComposition
    if (!composition || !this.__elephantRustMirror?.active) return
    this.__elephantRustComposition = null

    const finalMarkdown = composition.finalMarkdown || this.getMarkdown()
    const finalCursor = composition.finalCursor || this.contentState.getMuyaIndexCursor()
    const finalSelection = muyaIndexCursorToSelection(finalMarkdown, finalCursor)
    const text = String(event?.data || '')
    const start = Math.min(composition.selection.anchor, composition.selection.focus)
    const end = Math.max(composition.selection.anchor, composition.selection.focus)
    const expectedMarkdown = composition.markdown.slice(0, start) +
      text +
      composition.markdown.slice(end)

    if (!text || expectedMarkdown !== finalMarkdown) {
      this.__elephantRustMirror.sync(finalMarkdown, 'ime-composition-sync', {
        selection: finalSelection,
        continueGroup: false
      }).then(() => super.clearHistory()).catch((error) => {
        console.error('[elephantnote:muya-rust] IME synchronization failed', error)
      })
      return
    }

    this.__elephantRustMirror.commitComposition(composition.selection, text)
      .then((transaction) => {
        if (transaction?.state?.markdown !== finalMarkdown) {
          return this.__elephantRustMirror.sync(finalMarkdown, 'ime-composition-reconcile', {
            selection: finalSelection,
            continueGroup: false
          })
        }
        this.__elephantRustHistoryIdentity = ''
        this.__elephantRustExpectedMarkdown = null
        super.clearHistory()
        return transaction
      })
      .catch((error) => {
        console.error('[elephantnote:muya-rust] IME commit failed; synchronizing Muya result', error)
        return this.__elephantRustMirror.sync(finalMarkdown, 'ime-composition-fallback', {
          selection: finalSelection,
          continueGroup: false
        })
      })
  }

  __rustCanFormat (type) {
    const { start, end } = this.contentState.cursor || {}
    if (!start || !end || start.key !== end.key) return false
    const block = this.contentState.getBlock(start.key)
    if (block?.type !== 'span' || !INLINE_BLOCK_TYPES.test(block.functionType || '')) return false
    const { neighbors = [] } = this.contentState.selectionFormats({ start, end })
    return !neighbors.some((token) => token.type === type || token.tag === type)
  }

  __updateParagraphThroughRust (type, args = []) {
    const fallback = () => this.__elephantRustOriginalContentState.updateParagraph(type, ...args)
    const kind = RUST_BLOCK_KINDS[type]
    if (!kind) return fallback()

    const cursor = this.contentState.getMuyaIndexCursor()
    const isSingleLine = cursor?.anchor?.line === cursor?.focus?.line
    const markdown = this.getMarkdown()
    const currentLine = isSingleLine ? lineAt(markdown, cursor.anchor.line) : ''
    if (!isSingleLine || !rustCanTransformLine(type, currentLine)) return fallback()

    return this.__applyElephantRustCommand(
      `paragraph-${type}`,
      (engine) => engine.transformBlock(kind),
      fallback
    )
  }

  __tableContext (data, cellContentKey) {
    const { start, end } = this.contentState.cursor || {}
    if (!cellContentKey && (!start || !end || start.key !== end.key)) return null
    const block = this.contentState.getBlock(cellContentKey || start.key)
    if (block?.functionType !== 'cellContent') return null

    const cell = this.contentState.getParent(block)
    const row = this.contentState.getParent(cell)
    const table = this.contentState.closest(block, 'table')
    const body = table?.children?.[1]
    const column = row?.children?.indexOf(cell)
    const visualRow = cell?.type === 'th' ? 0 : (body?.children?.indexOf(row) ?? -1) + 1
    if (!table || !Number.isInteger(column) || column < 0 || visualRow < 0) return null

    const parsed = markdownTables(this.getMarkdown())
    if (parsed.tables.length !== 1) return null

    if (data?.target === 'row') {
      if (visualRow === 0) return null
      const bodyIndex = visualRow - 1
      if (data.action === 'insert') {
        const index = data.location === 'previous' ? bodyIndex : bodyIndex + 1
        return { action: 'insert_row', index, row: index + 1, column }
      }
      if (data.action === 'remove' && data.location === 'current') {
        return { action: 'delete_row', index: bodyIndex, row: visualRow, column }
      }
      return null
    }

    if (data?.target === 'column') {
      if (data.action === 'insert') {
        const index = data.location === 'left' ? column : column + 1
        return { action: 'insert_column', index, row: visualRow, column: index }
      }
      if (data.action === 'remove' && data.location === 'current') {
        const columnCount = row.children.length
        if (columnCount <= 1) return null
        return { action: 'delete_column', index: column, row: visualRow, column }
      }
    }
    return null
  }

  __editTableThroughRust (data, cellContentKey) {
    const fallback = () => this.__elephantRustOriginalContentState.editTable(data, cellContentKey)
    const context = this.__tableContext(data, cellContentKey)
    if (!context) return fallback()

    return this.__applyElephantRustCommand(
      `table-${context.action}`,
      async(engine) => {
        const transaction = await engine.tableCommand(context.action, context.index)
        if (!transaction?.documentChanged) return transaction
        const parsed = markdownTables(transaction.state.markdown)
        if (parsed.tables.length !== 1) return transaction
        const table = parsed.tables[0]
        const bodyRows = Math.max(0, table.end - table.start - 1)
        const columnCount = Math.max(1, lineAt(transaction.state.markdown, table.start).split('|').length - 2)
        const row = Math.min(context.row, bodyRows)
        const column = Math.min(context.column, columnCount - 1)
        const offset = tableCellOffset(transaction.state.markdown, table, row, column)
        if (!Number.isInteger(offset)) return transaction
        const selectionTransaction = await engine.setSelection(offset, offset)
        return {
          ...selectionTransaction,
          documentChanged: true,
          selectionChanged: true
        }
      },
      fallback
    )
  }

  __imageOperation (imageInfo, replacement) {
    const markdown = this.getMarkdown()
    const token = imageInfo?.token
    const range = token?.range
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return null

    const cursor = this.contentState.getMuyaIndexCursor()
    const selection = muyaIndexCursorToSelection(markdown, cursor)
    const count = Math.max(0, range.end - range.start)
    const end = selection.focus
    const pos = Math.max(0, end - count)
    const current = markdown.slice(pos, end)
    if (!current || current.length !== count || !/^(?:!\[|<img\s)/.test(current)) return null

    return {
      operation: {
        type: replacement ? 'replace' : 'delete',
        pos,
        count,
        text: replacement
      },
      selection: pos + replacement.length
    }
  }

  __updateImageThroughRust (imageInfo, attrName, attrValue) {
    const fallback = () => this.__elephantRustOriginalContentState.updateImage(
      imageInfo,
      attrName,
      attrValue
    )
    if (!['width', 'data-align'].includes(attrName)) return fallback()
    const replacement = imageHtml(imageInfo?.token, attrName, attrValue)
    const mutation = this.__imageOperation(imageInfo, replacement)
    if (!mutation) return fallback()

    return this.__applyElephantRustCommand(
      `image-${attrName}`,
      async(engine) => {
        const transaction = await engine.applyOperation(mutation.operation)
        const selectionTransaction = await engine.setSelection(mutation.selection, mutation.selection)
        return {
          ...selectionTransaction,
          documentChanged: transaction.documentChanged,
          selectionChanged: true
        }
      },
      fallback
    )
  }

  __deleteImageThroughRust (imageInfo) {
    const fallback = () => this.__elephantRustOriginalContentState.deleteImage(imageInfo)
    const mutation = this.__imageOperation(imageInfo, '')
    if (!mutation) return fallback()

    return this.__applyElephantRustCommand(
      'image-delete',
      async(engine) => {
        const transaction = await engine.applyOperation(mutation.operation)
        const selectionTransaction = await engine.setSelection(mutation.selection, mutation.selection)
        return {
          ...selectionTransaction,
          documentChanged: transaction.documentChanged,
          selectionChanged: true
        }
      },
      fallback
    )
  }

  __createFootnoteThroughRust (identifier) {
    const fallback = () => this.__elephantRustOriginalContentState.createFootnote(identifier)
    const label = String(identifier || '')
    if (!label || /[\]\r\n]/.test(label)) return fallback()

    return this.__applyElephantRustCommand(
      'footnote-create',
      async(engine) => {
        const transaction = await engine.upsertFootnote(label, '')
        if (!transaction?.documentChanged) return transaction
        const marker = `[^${label}]: `
        const position = transaction.state.markdown.lastIndexOf(marker)
        const selection = position < 0
          ? transaction.state.markdown.length
          : position + marker.length
        const selectionTransaction = await engine.setSelection(selection, selection)
        setTimeout(() => {
          if (this.container) this.container.scrollTop = this.container.scrollHeight
        }, 0)
        return {
          ...selectionTransaction,
          documentChanged: true,
          selectionChanged: true
        }
      },
      fallback
    )
  }

  __pasteThroughRust (event, type = 'normal', rawText, rawHtml) {
    const text = String(rawText ?? event?.clipboardData?.getData?.('text/plain') ?? '').replace(/\r/g, '')
    const sourceHtml = String(rawHtml ?? event?.clipboardData?.getData?.('text/html') ?? '').replace(/\r/g, '')
    const html = type === 'pasteAsPlainText' ? '' : sourceHtml
    const fallback = () => this.__elephantRustOriginalContentState.pasteHandler(
      event,
      type,
      text,
      sourceHtml
    )

    const { start, end } = this.contentState.cursor || {}
    if (!this.__elephantRustMirror?.active || !start || !end || start.key !== end.key) {
      return fallback()
    }
    const block = this.contentState.getBlock(start.key)
    if (
      block?.type !== 'span' ||
      !RUST_PASTE_BLOCK_TYPES.test(block.functionType || '') ||
      this.contentState.selectedImage ||
      this.contentState.selectedTableCells ||
      clipboardHasImage(event) ||
      (!html && URL_ONLY.test(text.trim()))
    ) {
      return fallback()
    }

    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyElephantRustCommand(
      type === 'pasteAsPlainText' ? 'paste-plain-text' : 'paste-rich',
      (engine) => engine.pasteClipboard(html, text),
      fallback
    )
  }

  __keyboardRuleContext (key) {
    if (
      !this.__elephantRustMirror?.active ||
      this.contentState.selectedImage ||
      this.contentState.selectedTableCells ||
      this.__elephantRustComposition
    ) return null

    const cursor = this.contentState.getMuyaIndexCursor()
    const anchor = cursor?.anchor
    const focus = cursor?.focus
    if (
      !anchor ||
      !focus ||
      anchor.line !== focus.line ||
      anchor.ch !== focus.ch
    ) return null

    const markdown = this.getMarkdown()
    const currentLine = lineAt(markdown, anchor.line)
    if (!SIMPLE_LIST_LINE.test(currentLine)) return null
    if (key === 'Enter' && anchor.ch !== currentLine.length) return null
    return { markdown, cursor }
  }

  __enterThroughRust (event) {
    const fallback = () => this.__elephantRustOriginalContentState.enterHandler(event)
    if (!this.__keyboardRuleContext('Enter')) return fallback()
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyElephantRustCommand(
      'keyboard-enter',
      (engine) => engine.keyboardRule('Enter'),
      fallback
    )
  }

  __tabThroughRust (event) {
    const fallback = () => this.__elephantRustOriginalContentState.tabHandler(event)
    if (!this.__keyboardRuleContext('Tab')) return fallback()
    event?.preventDefault?.()
    event?.stopPropagation?.()
    return this.__applyElephantRustCommand(
      event?.shiftKey ? 'keyboard-shift-tab' : 'keyboard-tab',
      (engine) => engine.keyboardRule('Tab', {
        shiftKey: Boolean(event?.shiftKey)
      }),
      fallback
    )
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
    if (!marker || !this.__rustCanFormat(type)) return super.format(type)
    return this.__applyElephantRustCommand(
      `format-${type}`,
      (engine) => engine.toggleInline(marker),
      () => super.format(type)
    )
  }

  updateParagraph (type) {
    return this.__updateParagraphThroughRust(type)
  }

  editTable (data) {
    return this.__editTableThroughRust(data)
  }

  insertImage ({ alt = '', src = '', title = '' } = {}) {
    const imageSource = encodeImageSource(src)
    const sourceAndTitle = title ? `${imageSource} "${title}"` : imageSource
    const replacement = `![${alt}](${sourceAndTitle})`
    const cursor = this.contentState.getMuyaIndexCursor()
    const markdown = this.getMarkdown()
    const selection = muyaIndexCursorToSelection(markdown, cursor)
    const start = Math.min(selection.anchor, selection.focus)
    const end = Math.max(selection.anchor, selection.focus)
    return this.__applyElephantRustCommand(
      'image-insert',
      (engine) => engine.applyOperation({
        type: 'replace',
        pos: start,
        count: end - start,
        text: replacement
      }),
      () => super.insertImage({ alt, src, title })
    )
  }

  destroy () {
    if (this.__elephantRustChangeListener) {
      this.off('change', this.__elephantRustChangeListener)
    }
    if (this.__elephantRustSelectionListener) {
      this.off('selectionChange', this.__elephantRustSelectionListener)
    }
    if (this.__elephantRustCompositionStartListener) {
      this.container.removeEventListener('compositionstart', this.__elephantRustCompositionStartListener)
    }
    if (this.__elephantRustCompositionEndListener) {
      this.container.removeEventListener('compositionend', this.__elephantRustCompositionEndListener)
    }
    if (this.__elephantRustOriginalContentState && this.contentState) {
      Object.assign(this.contentState, this.__elephantRustOriginalContentState)
    }
    this.__elephantRustMirror?.destroy()
    this.__elephantRustMirror = null
    this.__elephantRustOriginalContentState = null
    this.__elephantRustChangeListener = null
    this.__elephantRustSelectionListener = null
    this.__elephantRustCompositionStartListener = null
    this.__elephantRustCompositionEndListener = null
    this.__elephantRustComposition = null
    this.__elephantRustHistoryIdentity = ''
    this.__elephantRustExpectedMarkdown = null
    return super.destroy()
  }
}

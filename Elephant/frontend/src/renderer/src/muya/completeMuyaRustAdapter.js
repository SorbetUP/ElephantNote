import RustOwnedMuya from './realMuyaRustAdapter.js'

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/
const IMAGE_URL = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i

const markdownTableRanges = (markdown) => {
  const lines = String(markdown || '').split('\n')
  const ranges = []
  let offset = 0
  const offsets = lines.map((line) => {
    const result = offset
    offset += line.length + 1
    return result
  })
  for (let startLine = 0; startLine < lines.length - 1; startLine += 1) {
    if (!TABLE_ROW.test(lines[startLine]) || !TABLE_SEPARATOR.test(lines[startLine + 1])) continue
    let endLine = startLine + 1
    while (endLine + 1 < lines.length && TABLE_ROW.test(lines[endLine + 1])) endLine += 1
    ranges.push({
      start: offsets[startLine],
      end: offsets[endLine] + lines[endLine].length,
      startLine,
      endLine
    })
    startLine = endLine
  }
  return ranges
}

const tableRangeById = (markdown, tableId) => {
  const tableElements = Array.from(document.querySelectorAll('table.ag-paragraph'))
  const tableIndex = tableElements.findIndex((table) => table.id === tableId)
  if (tableIndex < 0) throw new Error(`Unable to locate Muya table ${tableId}.`)
  const range = markdownTableRanges(markdown)[tableIndex]
  if (!range) throw new Error('Muya DOM table has no matching Markdown table.')
  return range
}

const cellPosition = (tableElement, key) => {
  const cell = tableElement.querySelector(`#${CSS.escape(key)}`)
  if (!cell) throw new Error(`Unable to locate selected table cell ${key}.`)
  const row = cell.closest('tr')
  const rows = Array.from(tableElement.querySelectorAll('tr'))
  return {
    row: rows.indexOf(row),
    column: Array.from(row.children).indexOf(cell)
  }
}

export default class CompleteMuyaWithRustCore extends RustOwnedMuya {
  __installRustHooks () {
    super.__installRustHooks()
    const hooks = this.contentState
    hooks.docEnterHandler = (event) => this.__docEnter(event)
    hooks.docDeleteHandler = (event) => this.__docDelete(event)
    hooks.selectLanguage = (_paragraph, language) => this.__setCodeLanguage(language)
    hooks.updateCodeLanguage = (_block, language) => this.__setCodeLanguage(language)
    hooks.codeBlockUpdate = (_block, code = '', language = '') => (
      this.__insertBlock('code', language, code)
    )
    hooks.switchTableData = () => this.__switchTableData()
    hooks.deleteSelectedTableCells = (isCut = false) => this.__clearSelectedTableCells(isCut)
  }

  __beforeInput (event) {
    if (!this.__rustMirror?.active || this.__rustComposition) return
    const inputType = String(event.inputType || '')
    if (inputType === 'insertFromPaste' || inputType === 'insertCompositionText') return
    const commands = {
      insertText: {
        type: 'smartInput',
        text: String(event.data ?? ''),
        autoPairBracket: this.options.autoPairBracket !== false,
        autoPairMarkdownSyntax: this.options.autoPairMarkdownSyntax !== false
      },
      insertParagraph: { type: 'smartEnter', shiftKey: false },
      insertLineBreak: { type: 'smartEnter', shiftKey: true },
      deleteContentBackward: { type: 'smartDeleteBackward' },
      deleteContentForward: { type: 'smartDeleteForward' }
    }
    const command = commands[inputType]
    if (!command) return super.__beforeInput(event)
    event.preventDefault()
    event.stopImmediatePropagation()
    this.__applyRust(`advanced-${inputType}`, (engine) => engine.complete(command)).catch(() => {})
  }

  __backspace (event) {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    return this.__applyRust('smart-backspace', (engine) => engine.complete({
      type: 'smartDeleteBackward'
    }))
  }

  __deleteForward (event) {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    return this.__applyRust('smart-delete-forward', (engine) => engine.complete({
      type: 'smartDeleteForward'
    }))
  }

  __enter (event) {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    return this.__applyRust('smart-enter', (engine) => engine.complete({
      type: 'smartEnter',
      shiftKey: Boolean(event?.shiftKey)
    }))
  }

  __docEnter (event) {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    const selectedImage = this.contentState.selectedImage
    if (!selectedImage) return
    const { imageId, ...imageInfo } = selectedImage
    const image = document.querySelector(`#${CSS.escape(imageId)}`)
    if (!image) return
    const rect = image.getBoundingClientRect()
    this.eventCenter.dispatch('muya-image-selector', {
      reference: {
        getBoundingClientRect() {
          return { ...rect, height: 0 }
        }
      },
      imageInfo,
      cb: () => {}
    })
    this.contentState.selectedImage = null
  }

  __docDelete (event) {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    if (this.contentState.selectedImage) {
      return this.__deleteImage(this.contentState.selectedImage)
    }
    if (this.contentState.selectedTableCells) {
      return this.__clearSelectedTableCells(false)
    }
  }

  __insertBlock (kind, language = '', content = '') {
    return this.__applyRust(`insert-block-${kind}`, (engine) => engine.complete({
      type: 'insertBlock',
      kind: String(kind),
      language: String(language),
      content: String(content)
    }))
  }

  __setCodeLanguage (language) {
    return this.__applyRust('code-language', (engine) => engine.setCodeLanguage(String(language || '')))
  }

  __switchTableData () {
    const drag = this.contentState.dragInfo
    if (!drag) return
    const markdown = this.getMarkdown()
    const range = tableRangeById(markdown, drag.tableId)
    const axis = drag.barType === 'bottom' ? 'column' : 'row'
    const mapRow = (index) => index === 0 ? 0 : index + 1
    const from = axis === 'row' ? mapRow(drag.index) : drag.index
    const to = axis === 'row' ? mapRow(drag.curIndex) : drag.curIndex
    return this.__applyRust(`reorder-table-${axis}`, (engine) => engine.complete({
      type: 'reorderTable',
      start: range.start,
      end: range.end,
      axis,
      from,
      to
    }))
  }

  __clearSelectedTableCells (isCut = false) {
    const selected = this.contentState.selectedTableCells
    if (!selected?.tableId || !Array.isArray(selected.cells)) return
    const markdown = this.getMarkdown()
    const range = tableRangeById(markdown, selected.tableId)
    const table = document.querySelector(`#${CSS.escape(selected.tableId)}`)
    if (!table) throw new Error('Unable to locate the selected table.')
    const cells = selected.cells.map(({ key }) => cellPosition(table, key))
    this.contentState.selectedTableCells = null
    return this.__applyRust('clear-table-cells', (engine) => engine.complete({
      type: 'clearTableCells',
      start: range.start,
      end: range.end,
      cells,
      cut: Boolean(isCut)
    }))
  }

  __drop (event) {
    const uri = String(event?.dataTransfer?.getData?.('text/uri-list') || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))
    if (!uri) return super.__drop(event)
    event.preventDefault()
    event.stopImmediatePropagation()
    if (IMAGE_URL.test(uri)) {
      return this.__applyRust('drop-image-url', (engine) => engine.complete({
        type: 'insertImage',
        alt: '',
        src: uri,
        title: ''
      }))
    }
    return this.__applyRust('drop-link-url', (engine) => engine.complete({
      type: 'insertLink',
      url: uri,
      title: ''
    }))
  }

  replaceWordInline (text) {
    return this.__applyRust('replace-current-word', (engine) => engine.complete({
      type: 'replaceCurrentWord',
      text: String(text || '')
    }))
  }
}

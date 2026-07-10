import { createRustMuyaEngineClient, isRustMuyaEngineAvailable } from './rustEngineRuntime.js'

let sessionSequence = 0

const asMarkdown = (value) => String(value ?? '')
const createSessionId = () => {
  sessionSequence += 1
  return `muya:${Date.now()}:${sessionSequence}`
}

const createStatus = () => ({
  active: false,
  phase: 'disabled',
  reason: '',
  revision: 0,
  markdownLength: 0,
  blocks: 0,
  selection: { anchor: 0, focus: 0 },
  undoDepth: 0,
  redoDepth: 0,
  error: ''
})

const publishStatus = (target, status) => {
  if (!target || typeof target !== 'object') return
  target.__ELEPHANT_MUYA_RUST_MIRROR__ = {
    ...status,
    selection: { ...status.selection }
  }
}

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

export const muyaIndexCursorToSelection = (markdown, cursor) => {
  const source = asMarkdown(markdown)
  const lines = source.split('\n')
  const pointToOffset = (point) => {
    if (!point || !Number.isInteger(point.line) || !Number.isInteger(point.ch)) return source.length
    const line = clamp(point.line, 0, Math.max(0, lines.length - 1))
    const ch = clamp(point.ch, 0, lines[line]?.length || 0)
    let offset = ch
    for (let index = 0; index < line; index += 1) offset += lines[index].length + 1
    return offset
  }
  return {
    anchor: pointToOffset(cursor?.anchor),
    focus: pointToOffset(cursor?.focus)
  }
}

export const selectionToMuyaIndexCursor = (markdown, selection) => {
  const source = asMarkdown(markdown)
  const lines = source.split('\n')
  const offsetToPoint = (value) => {
    let remaining = clamp(Number.isInteger(value) ? value : source.length, 0, source.length)
    for (let line = 0; line < lines.length; line += 1) {
      const length = lines[line].length
      if (remaining <= length) return { line, ch: remaining }
      remaining -= length
      if (line < lines.length - 1) remaining -= 1
    }
    const line = Math.max(0, lines.length - 1)
    return { line, ch: lines[line]?.length || 0 }
  }
  return {
    anchor: offsetToPoint(selection?.anchor),
    focus: offsetToPoint(selection?.focus)
  }
}

const unavailableFacade = (status) => {
  const unavailable = async() => {
    throw new Error('The canonical Rust Muya engine is unavailable.')
  }
  return {
    active: false,
    status,
    ready: Promise.resolve(status),
    sync: unavailable,
    reset: unavailable,
    flush: unavailable,
    undo: unavailable,
    redo: unavailable,
    setSelection: unavailable,
    toggleInline: unavailable,
    transformBlock: unavailable,
    applyOperation: unavailable,
    keyboardRule: unavailable,
    tableCommand: unavailable,
    upsertFootnote: unavailable,
    insertTemplate: unavailable,
    pasteClipboard: unavailable,
    commitComposition: unavailable,
    replaceRange: unavailable,
    deleteBackward: unavailable,
    deleteForward: unavailable,
    insertParagraph: unavailable,
    duplicateBlock: unavailable,
    deleteBlock: unavailable,
    moveBlock: unavailable,
    indentSelection: unavailable,
    toggleTask: unavailable,
    setCodeLanguage: unavailable,
    insertLink: unavailable,
    removeLink: unavailable,
    searchReplace: unavailable,
    selectAll: unavailable,
    destroy: () => {}
  }
}

export const createRealMuyaRustMirror = ({
  initialMarkdown = '',
  invoke,
  target = globalThis,
  logger = console
} = {}) => {
  const status = createStatus()
  const bridgeAvailable = typeof invoke === 'function' || isRustMuyaEngineAvailable(target)

  if (!bridgeAvailable) {
    status.reason = 'tauri-invoke-unavailable'
    publishStatus(target, status)
    return unavailableFacade(status)
  }

  const client = createRustMuyaEngineClient({
    invoke,
    target,
    sessionId: createSessionId()
  })
  let destroyed = false
  let initialized = false
  let pending = null
  let draining = null
  let commandQueue = Promise.resolve()
  let lastValidatedMarkdown = null
  let lastValidatedSelection = null

  status.active = true
  status.phase = 'initializing'
  publishStatus(target, status)

  const fail = (error) => {
    status.phase = 'error'
    status.error = error instanceof Error ? error.message : String(error)
    publishStatus(target, status)
    logger.error?.('[elephantnote:muya-rust] core failed', { error: status.error })
  }

  const refreshStatus = async(reason) => {
    const state = client.state
    const jsonState = await client.jsonState()
    if (jsonState.type !== 'muya-json-state' || !Array.isArray(jsonState.blocks)) {
      throw new Error('Rust Muya core returned an invalid document tree.')
    }
    lastValidatedMarkdown = state.markdown
    lastValidatedSelection = { ...state.selection }
    status.phase = 'ready'
    status.reason = reason
    status.revision = Number(state.revision) || 0
    status.markdownLength = state.markdown.length
    status.blocks = jsonState.blocks.length
    status.selection = { ...state.selection }
    status.undoDepth = Number.isInteger(state.undoDepth) ? state.undoDepth : 0
    status.redoDepth = Number.isInteger(state.redoDepth) ? state.redoDepth : 0
    status.error = ''
    publishStatus(target, status)
    return status
  }

  const validate = async({ kind, markdown, selection, reason, continueGroup }) => {
    const state = kind === 'reset' || !initialized
      ? await client.create(markdown)
      : (await client.syncDocument(markdown, selection, continueGroup)).state
    initialized = true
    if (state.markdown !== markdown) {
      throw new Error('Rust Muya core changed the Markdown during synchronization.')
    }
    if (state.selection.anchor !== selection.anchor || state.selection.focus !== selection.focus) {
      const transaction = await client.setSelection(selection.anchor, selection.focus)
      if (transaction.state.markdown !== markdown) {
        throw new Error('Rust Muya core changed Markdown while synchronizing selection.')
      }
    }
    await refreshStatus(reason)
    return status
  }

  const drain = async() => {
    if (destroyed || !pending) return
    const next = pending
    pending = null
    const sameMarkdown = next.markdown === lastValidatedMarkdown
    const sameSelection = lastValidatedSelection &&
      next.selection.anchor === lastValidatedSelection.anchor &&
      next.selection.focus === lastValidatedSelection.focus
    if (next.kind === 'reset' || !sameMarkdown || !sameSelection) await validate(next)
    if (!destroyed && pending) await drain()
  }

  const ensureDrain = () => {
    if (draining || destroyed) return draining || Promise.resolve(status)
    draining = Promise.resolve()
      .then(drain)
      .catch((error) => {
        fail(error)
        throw error
      })
      .finally(() => {
        draining = null
        if (pending && !destroyed) ensureDrain()
      })
    return draining
  }

  const enqueue = (kind, markdown, reason, options = {}) => {
    if (destroyed) return Promise.reject(new Error('Rust Muya session is destroyed.'))
    const source = asMarkdown(markdown)
    const selection = options.selection || muyaIndexCursorToSelection(source, options.muyaIndexCursor)
    pending = {
      kind,
      markdown: source,
      selection,
      reason: String(reason || kind),
      continueGroup: kind === 'sync' && Boolean(options.continueGroup)
    }
    return ensureDrain()
  }

  const sync = (markdown, reason = 'change', options = {}) => enqueue('sync', markdown, reason, options)
  const reset = (markdown, reason = 'set-markdown', options = {}) => enqueue('reset', markdown, reason, options)

  const flush = async() => {
    if (draining) await draining
    else if (pending) await ensureDrain()
    if (draining || pending) return flush()
    return status
  }

  const applyCommand = (reason, operation) => {
    commandQueue = commandQueue
      .catch(() => null)
      .then(async() => {
        await flush()
        if (status.phase === 'error') {
          throw new Error(status.error || 'Rust Muya core is in an error state.')
        }
        if (destroyed || !initialized) throw new Error('Rust Muya session is not initialized.')
        const transaction = await operation(client)
        await refreshStatus(reason)
        logger.info?.(`[elephantnote:muya-rust] ${reason}`, {
          documentChanged: Boolean(transaction.documentChanged),
          selectionChanged: Boolean(transaction.selectionChanged),
          revision: status.revision,
          undoDepth: status.undoDepth,
          redoDepth: status.redoDepth
        })
        return transaction
      })
    return commandQueue
  }

  const command = (reason, callback) => () => applyCommand(reason, callback)
  const commandWith = (reason, callback) => (...args) => applyCommand(reason, (engine) => callback(engine, ...args))

  const ready = reset(initialMarkdown, 'initial')
  target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'muya-ui-rust-core'
  logger.info?.('[elephantnote:editor] real Muya UI with Rust-owned core active', {
    engine: 'rust',
    surface: 'muya',
    sessionId: client.sessionId
  })

  return {
    active: true,
    status,
    ready,
    sync,
    reset,
    flush,
    undo: command('rust-undo', (engine) => engine.undo()),
    redo: command('rust-redo', (engine) => engine.redo()),
    setSelection: commandWith('rust-selection', (engine, anchor, focus = anchor) => (
      engine.setSelection(anchor, focus)
    )),
    toggleInline: commandWith('rust-inline', (engine, marker) => engine.toggleInline(String(marker))),
    transformBlock: commandWith('rust-block', (engine, kind) => engine.transformBlock(String(kind))),
    applyOperation: commandWith('rust-operation', (engine, operation) => engine.applyOperation(operation)),
    keyboardRule: commandWith('rust-keyboard', (engine, key, options = {}) => (
      engine.keyboardRule(String(key), options)
    )),
    tableCommand: commandWith('rust-table', (engine, action, index = 0) => (
      engine.tableCommand(String(action), index)
    )),
    upsertFootnote: commandWith('rust-footnote-upsert', (engine, label, text = '') => (
      engine.upsertFootnote(String(label), String(text))
    )),
    insertTemplate: commandWith('rust-template', (engine, id) => engine.insertTemplate(String(id))),
    pasteClipboard: commandWith('rust-rich-paste', (engine, html = '', text = '') => (
      engine.pasteClipboard(String(html), String(text))
    )),
    commitComposition: commandWith('rust-ime-commit', (engine, selection, text) => (
      engine.commitComposition(selection, String(text))
    )),
    replaceRange: commandWith('rust-replace-range', (engine, start, end, text = '') => (
      engine.replaceRange(start, end, text)
    )),
    deleteBackward: command('rust-delete-backward', (engine) => engine.completeDeleteBackward()),
    deleteForward: command('rust-delete-forward', (engine) => engine.completeDeleteForward()),
    insertParagraph: commandWith('rust-insert-paragraph', (engine, location, text = '') => (
      engine.insertParagraph(location, text)
    )),
    duplicateBlock: command('rust-duplicate-block', (engine) => engine.duplicateBlock()),
    deleteBlock: command('rust-delete-block', (engine) => engine.deleteBlock()),
    moveBlock: commandWith('rust-move-block', (engine, fromStart, fromEnd, targetOffset) => (
      engine.moveBlock(fromStart, fromEnd, targetOffset)
    )),
    indentSelection: commandWith('rust-indent-selection', (engine, options = {}) => (
      engine.indentSelection(options)
    )),
    toggleTask: command('rust-toggle-task', (engine) => engine.toggleTask()),
    setCodeLanguage: commandWith('rust-code-language', (engine, language) => (
      engine.setCodeLanguage(language)
    )),
    insertLink: commandWith('rust-insert-link', (engine, url, title = '') => (
      engine.insertLink(url, title)
    )),
    removeLink: command('rust-remove-link', (engine) => engine.removeLink()),
    searchReplace: commandWith('rust-search-replace', (engine, options) => (
      engine.searchReplace(options)
    )),
    selectAll: command('rust-select-all', (engine) => engine.selectAll()),
    get state() { return client.state },
    get sessionId() { return client.sessionId },
    destroy: () => {
      destroyed = true
      pending = null
      client.close().catch((error) => {
        logger.error?.('[elephantnote:muya-rust] failed to close Rust session', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      if (target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ === 'muya-ui-rust-core') {
        delete target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__
      }
      delete target.__ELEPHANT_MUYA_RUST_MIRROR__
    }
  }
}

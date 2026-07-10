import { createRustMuyaEngineClient, isRustMuyaEngineAvailable } from './rustEngineRuntime.js'

const asMarkdown = (value) => String(value ?? '')

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
    if (!point || !Number.isInteger(point.line) || !Number.isInteger(point.ch)) {
      return source.length
    }
    const line = clamp(point.line, 0, Math.max(0, lines.length - 1))
    const ch = clamp(point.ch, 0, lines[line]?.length || 0)
    let offset = ch
    for (let index = 0; index < line; index += 1) {
      offset += lines[index].length + 1
    }
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
    return {
      active: false,
      status,
      ready: Promise.resolve(status),
      sync: async() => status,
      reset: async() => status,
      flush: async() => status,
      undo: async() => null,
      redo: async() => null,
      toggleInline: async() => null,
      transformBlock: async() => null,
      destroy: () => {}
    }
  }

  const client = createRustMuyaEngineClient({ invoke, target })
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
    logger.error?.('[elephantnote:muya-rust] core failed', {
      error: status.error
    })
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
    status.undoDepth = Array.isArray(state.undoStack) ? state.undoStack.length : 0
    status.redoDepth = Array.isArray(state.redoStack) ? state.redoStack.length : 0
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
      const selectionTransaction = await client.setSelection(selection.anchor, selection.focus)
      if (selectionTransaction.state.markdown !== markdown) {
        throw new Error('Rust Muya core changed Markdown while synchronizing selection.')
      }
    }

    await refreshStatus(reason)
    logger.debug?.('[elephantnote:muya-rust] synchronized', {
      kind,
      reason,
      markdownLength: status.markdownLength,
      blocks: status.blocks,
      revision: status.revision,
      selection: status.selection,
      undoDepth: status.undoDepth,
      redoDepth: status.redoDepth,
      continueGroup
    })
    return status
  }

  const drain = async() => {
    while (!destroyed && pending) {
      const next = pending
      pending = null
      const sameMarkdown = next.markdown === lastValidatedMarkdown
      const sameSelection = lastValidatedSelection &&
        next.selection.anchor === lastValidatedSelection.anchor &&
        next.selection.focus === lastValidatedSelection.focus
      if (next.kind !== 'reset' && sameMarkdown && sameSelection) continue
      await validate(next)
    }
  }

  const ensureDrain = () => {
    if (draining || destroyed) return draining || Promise.resolve(status)
    draining = Promise.resolve()
      .then(drain)
      .catch(fail)
      .finally(() => {
        draining = null
        if (pending && !destroyed) ensureDrain()
      })
    return draining
  }

  const enqueue = (kind, markdown, reason, options = {}) => {
    if (destroyed) return Promise.resolve(status)
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

  const sync = (markdown, reason = 'change', options = {}) => (
    enqueue('sync', markdown, reason, options)
  )
  const reset = (markdown, reason = 'set-markdown', options = {}) => (
    enqueue('reset', markdown, reason, options)
  )

  const flush = async() => {
    while (draining || pending) {
      await (draining || ensureDrain())
    }
    return status
  }

  const applyCommand = (reason, operation) => {
    commandQueue = commandQueue.then(async() => {
      await flush()
      if (destroyed || !initialized) return null
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

  const ready = reset(initialMarkdown, 'initial')
  target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'muya-ui-rust-core'
  logger.info?.('[elephantnote:editor] real Muya UI with persistent Rust core active', {
    engine: 'rust',
    surface: 'muya'
  })

  return {
    active: true,
    status,
    ready,
    sync,
    reset,
    flush,
    undo: () => applyCommand('rust-undo', (engine) => engine.undo()),
    redo: () => applyCommand('rust-redo', (engine) => engine.redo()),
    toggleInline: (marker) => applyCommand(
      `rust-inline-${String(marker)}`,
      (engine) => engine.toggleInline(String(marker))
    ),
    transformBlock: (kind) => applyCommand(
      `rust-block-${String(kind)}`,
      (engine) => engine.transformBlock(String(kind))
    ),
    get state() {
      return client.state
    },
    destroy: () => {
      destroyed = true
      pending = null
      if (target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ === 'muya-ui-rust-core') {
        delete target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__
      }
      if (target.__ELEPHANT_MUYA_RUST_MIRROR__) {
        delete target.__ELEPHANT_MUYA_RUST_MIRROR__
      }
    }
  }
}

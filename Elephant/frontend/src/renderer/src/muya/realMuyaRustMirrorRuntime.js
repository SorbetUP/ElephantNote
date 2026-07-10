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
      flush: async() => status,
      destroy: () => {}
    }
  }

  const client = createRustMuyaEngineClient({ invoke, target })
  let destroyed = false
  let initialized = false
  let pending = null
  let draining = null
  let lastValidatedMarkdown = null
  let lastValidatedSelection = null

  status.active = true
  status.phase = 'initializing'
  publishStatus(target, status)

  const fail = (error) => {
    status.phase = 'error'
    status.error = error instanceof Error ? error.message : String(error)
    publishStatus(target, status)
    logger.error?.('[elephantnote:muya-rust] mirror failed', {
      error: status.error
    })
  }

  const validate = async({ markdown, selection, reason, continueGroup }) => {
    const state = initialized
      ? (await client.syncDocument(markdown, selection, continueGroup)).state
      : await client.create(markdown)
    initialized = true

    if (!initialized || state.markdown !== markdown) {
      throw new Error('Rust Muya mirror changed the Markdown during synchronization.')
    }

    if (state.selection.anchor !== selection.anchor || state.selection.focus !== selection.focus) {
      const selectionTransaction = await client.setSelection(selection.anchor, selection.focus)
      if (selectionTransaction.state.markdown !== markdown) {
        throw new Error('Rust Muya mirror changed Markdown while synchronizing selection.')
      }
    }

    const jsonState = await client.jsonState()
    if (jsonState.type !== 'muya-json-state' || !Array.isArray(jsonState.blocks)) {
      throw new Error('Rust Muya mirror returned an invalid document tree.')
    }

    lastValidatedMarkdown = markdown
    lastValidatedSelection = { ...selection }
    status.phase = 'ready'
    status.reason = reason
    status.revision = Number(client.state?.revision) || 0
    status.markdownLength = markdown.length
    status.blocks = jsonState.blocks.length
    status.selection = { ...selection }
    status.error = ''
    publishStatus(target, status)
    logger.debug?.('[elephantnote:muya-rust] synchronized', {
      reason,
      markdownLength: status.markdownLength,
      blocks: status.blocks,
      revision: status.revision,
      selection: status.selection,
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
      if (sameMarkdown && sameSelection) continue
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

  const sync = (markdown, reason = 'change', options = {}) => {
    if (destroyed) return Promise.resolve(status)
    const source = asMarkdown(markdown)
    const selection = options.selection || muyaIndexCursorToSelection(source, options.muyaIndexCursor)
    pending = {
      markdown: source,
      selection,
      reason: String(reason || 'change'),
      continueGroup: Boolean(options.continueGroup)
    }
    return ensureDrain()
  }

  const ready = sync(initialMarkdown, 'initial')
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
    flush: async() => {
      while (draining || pending) {
        await (draining || ensureDrain())
      }
      return status
    },
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

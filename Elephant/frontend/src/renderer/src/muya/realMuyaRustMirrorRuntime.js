import { createRustMuyaEngineClient, isRustMuyaEngineAvailable } from './rustEngineRuntime.js'

const asMarkdown = (value) => String(value ?? '')

const createStatus = () => ({
  active: false,
  phase: 'disabled',
  reason: '',
  revision: 0,
  markdownLength: 0,
  blocks: 0,
  error: ''
})

const publishStatus = (target, status) => {
  if (!target || typeof target !== 'object') return
  target.__ELEPHANT_MUYA_RUST_MIRROR__ = { ...status }
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
  let pending = null
  let draining = null
  let lastValidatedMarkdown = null

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

  const validate = async(markdown, reason) => {
    const state = await client.reset(markdown)
    if (state.markdown !== markdown) {
      throw new Error('Rust Muya mirror changed the Markdown during synchronization.')
    }

    const jsonState = await client.jsonState()
    if (jsonState.type !== 'muya-json-state' || !Array.isArray(jsonState.blocks)) {
      throw new Error('Rust Muya mirror returned an invalid document tree.')
    }

    lastValidatedMarkdown = markdown
    status.phase = 'ready'
    status.reason = reason
    status.revision = Number(state.revision) || 0
    status.markdownLength = markdown.length
    status.blocks = jsonState.blocks.length
    status.error = ''
    publishStatus(target, status)
    logger.debug?.('[elephantnote:muya-rust] synchronized', {
      reason,
      markdownLength: status.markdownLength,
      blocks: status.blocks,
      revision: status.revision
    })
    return status
  }

  const drain = async() => {
    while (!destroyed && pending) {
      const next = pending
      pending = null
      if (next.markdown === lastValidatedMarkdown) continue
      await validate(next.markdown, next.reason)
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

  const sync = (markdown, reason = 'change') => {
    if (destroyed) return Promise.resolve(status)
    pending = { markdown: asMarkdown(markdown), reason: String(reason || 'change') }
    return ensureDrain()
  }

  const ready = sync(initialMarkdown, 'initial')
  target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'muya-ui-rust-mirror'
  logger.info?.('[elephantnote:editor] real Muya UI with Rust document mirror active', {
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
    destroy: () => {
      destroyed = true
      pending = null
      if (target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ === 'muya-ui-rust-mirror') {
        delete target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__
      }
      if (target.__ELEPHANT_MUYA_RUST_MIRROR__) {
        delete target.__ELEPHANT_MUYA_RUST_MIRROR__
      }
    }
  }
}

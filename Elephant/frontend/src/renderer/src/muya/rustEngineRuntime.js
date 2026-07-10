const requireInvoke = (target = globalThis) => {
  const invoke = target?.tauri?.ipcRenderer?.invoke || target?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') {
    throw new Error('Muya Rust engine requires the Tauri invoke bridge.')
  }
  return invoke
}

const ensureState = (state) => {
  if (!state || typeof state !== 'object' || typeof state.markdown !== 'string') {
    throw new Error('Muya Rust engine returned an invalid editor state.')
  }
  return state
}

export const createRustMuyaEngineClient = ({ invoke, target = globalThis } = {}) => {
  const call = invoke || requireInvoke(target)
  let state = null

  const create = async(markdown = '') => {
    state = ensureState(await call('tauri_muya_engine_create', { markdown: String(markdown) }))
    return state
  }

  const capabilities = async() => call('tauri_muya_engine_capabilities')

  const apply = async(command) => {
    if (!state) throw new Error('Muya Rust engine must be initialized before applying commands.')
    const transaction = await call('tauri_muya_engine_apply', { state, command })
    state = ensureState(transaction?.state)
    return transaction
  }

  const applyBatch = async(commands = []) => {
    if (!state) throw new Error('Muya Rust engine must be initialized before applying commands.')
    const transaction = await call('tauri_muya_engine_apply_batch', { state, commands })
    state = ensureState(transaction?.state)
    return transaction
  }

  const reset = async(markdown = '') => create(markdown)

  return {
    get state() { return state },
    get markdown() { return state?.markdown || '' },
    create,
    reset,
    capabilities,
    apply,
    applyBatch,
    insertText: (text) => apply({ type: 'insertText', text: String(text) }),
    replaceSelection: (text) => apply({ type: 'replaceSelection', text: String(text) }),
    deleteBackward: () => apply({ type: 'deleteBackward' }),
    deleteForward: () => apply({ type: 'deleteForward' }),
    setSelection: (anchor, focus = anchor) => apply({ type: 'setSelection', anchor, focus }),
    toggleInline: (marker) => apply({ type: 'toggleInline', marker }),
    transformBlock: (kind) => apply({ type: 'transformBlock', kind }),
    insertLineBreak: () => apply({ type: 'insertLineBreak' }),
    undo: () => apply({ type: 'undo' }),
    redo: () => apply({ type: 'redo' })
  }
}

export const isRustMuyaEngineAvailable = (target = globalThis) => (
  typeof target?.tauri?.ipcRenderer?.invoke === 'function' ||
  typeof target?.__TAURI__?.core?.invoke === 'function'
)

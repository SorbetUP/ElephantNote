const requireInvoke = (target = globalThis) => {
  const ipcRenderer = target?.tauri?.ipcRenderer
  if (typeof ipcRenderer?.invoke === 'function') {
    return ipcRenderer.invoke.bind(ipcRenderer)
  }

  const core = target?.__TAURI__?.core
  if (typeof core?.invoke === 'function') {
    return core.invoke.bind(core)
  }

  throw new Error('Muya Rust engine requires the Tauri invoke bridge.')
}

const ensureState = (state) => {
  if (!state || typeof state !== 'object' || typeof state.markdown !== 'string') {
    throw new Error('Muya Rust engine returned an invalid editor state.')
  }
  return state
}

const ensureCommand = (command) => {
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
    throw new Error('Muya Rust engine requires a typed editor command.')
  }
  return command
}

export const createRustMuyaEngineClient = ({ invoke, target = globalThis } = {}) => {
  const call = invoke || requireInvoke(target)
  let state = null

  const create = async(markdown = '') => {
    state = ensureState(await call('tauri_muya_engine_create', { markdown: String(markdown) }))
    return state
  }

  const capabilities = async() => call('tauri_muya_engine_capabilities')

  const applyTransaction = async(commandName, command) => {
    if (!state) throw new Error('Muya Rust engine must be initialized before applying commands.')
    const transaction = await call(commandName, {
      state,
      command: ensureCommand(command)
    })
    state = ensureState(transaction?.state)
    return transaction
  }

  const query = async(queryCommand, { requireState = true } = {}) => {
    if (requireState && !state) {
      throw new Error('Muya Rust engine must be initialized before querying editor state.')
    }
    return call('tauri_muya_engine_query', {
      state: state || null,
      query: ensureCommand(queryCommand)
    })
  }

  const apply = async(command) => applyTransaction('tauri_muya_engine_apply', command)
  const applyParity = async(command) => applyTransaction('tauri_muya_engine_apply_parity', command)

  const applyBatch = async(commands = []) => {
    if (!state) throw new Error('Muya Rust engine must be initialized before applying commands.')
    const transaction = await call('tauri_muya_engine_apply_batch', {
      state,
      commands: commands.map(ensureCommand)
    })
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
    applyParity,
    applyBatch,
    query,
    insertText: (text) => apply({ type: 'insertText', text: String(text) }),
    replaceSelection: (text) => apply({ type: 'replaceSelection', text: String(text) }),
    deleteBackward: () => apply({ type: 'deleteBackward' }),
    deleteForward: () => apply({ type: 'deleteForward' }),
    setSelection: (anchor, focus = anchor) => apply({ type: 'setSelection', anchor, focus }),
    toggleInline: (marker) => apply({ type: 'toggleInline', marker }),
    transformBlock: (kind) => apply({ type: 'transformBlock', kind }),
    insertLineBreak: () => apply({ type: 'insertLineBreak' }),
    undo: () => apply({ type: 'undo' }),
    redo: () => apply({ type: 'redo' }),
    applyOperation: (operation) => applyParity({ type: 'applyOperation', operation }),
    keyboardRule: (key, { shiftKey = false } = {}) => applyParity({
      type: 'keyboardRule',
      key: String(key),
      shiftKey: Boolean(shiftKey)
    }),
    tableCommand: (action, index = 0) => applyParity({
      type: 'tableCommand',
      action: String(action),
      index
    }),
    resizeImage: (cursor, width) => applyParity({
      type: 'resizeImage',
      cursor,
      width: String(width)
    }),
    upsertFootnote: (label, text) => applyParity({
      type: 'upsertFootnote',
      label: String(label),
      text: String(text)
    }),
    insertTemplate: (id) => applyParity({ type: 'insertTemplate', id: String(id) }),
    clipboard: () => query({ type: 'clipboard' }),
    imageToolbar: (cursor = null) => query({ type: 'imageToolbar', cursor }),
    footnotePopup: (cursor = null) => query({ type: 'footnotePopup', cursor }),
    slashCommands: (queryText = '') => query({
      type: 'slashCommands',
      query: String(queryText)
    }, { requireState: false }),
    previewDescriptor: (blockType, language = null, text = '') => query({
      type: 'previewDescriptor',
      blockType: String(blockType),
      language: language == null ? null : String(language),
      text: String(text)
    }, { requireState: false })
  }
}

export const isRustMuyaEngineAvailable = (target = globalThis) => (
  typeof target?.tauri?.ipcRenderer?.invoke === 'function' ||
  typeof target?.__TAURI__?.core?.invoke === 'function'
)

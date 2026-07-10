const RUNTIME_SELECT = '.en-code-v6-language'
const RUNTIME_UI = '.en-code-v6-toolbar, .en-code-v6-output'
const NATIVE_LANGUAGE = [
  '.ag-language-input',
  '.language-input',
  '.ag-code-language',
  '.code-block-language',
  '[data-function-type="languageInput"]',
  '[functiontype="languageInput"]',
  '[data-role="language-input"]',
  '[data-language-input]',
  '[data-placeholder*="language" i]',
  '[placeholder*="language" i]'
].join(', ')

export const normalizeCodeLanguage = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/^language-/, '')
  .replace(/^lang-/, '')

const languageValue = (element) => normalizeCodeLanguage(
  element?.value || element?.dataset?.value || element?.textContent || ''
)

const replaceLanguageClass = (node, language) => {
  if (!node || !language) return
  for (const className of [...node.classList]) {
    if (className.startsWith('language-') || className.startsWith('lang-')) {
      node.classList.remove(className)
    }
  }
  node.classList.add(`language-${language}`)
  node.dataset.language = language
}

const stateForElement = (runtime, element) => {
  for (const state of runtime.states?.values?.() || []) {
    if (state.languageSelect === element) return state
    if (state.host?.contains?.(element)) return state
  }
  return null
}

const nativeControlForState = (state) => {
  const remembered = state.chrome?.languageControl
  if (remembered &&
      remembered !== state.languageSelect &&
      !remembered.matches?.(RUNTIME_SELECT) &&
      !remembered.closest?.(RUNTIME_UI)) {
    return remembered
  }

  const candidates = state.host?.querySelectorAll?.(NATIVE_LANGUAGE) || []
  return [...candidates].find((candidate) =>
    candidate !== state.languageSelect &&
    !candidate.matches?.(RUNTIME_SELECT) &&
    !candidate.closest?.(RUNTIME_UI)) || null
}

const makeInputEvent = (target, language) => {
  const EventCtor = target.InputEvent || target.Event
  if (target.InputEvent) {
    return new EventCtor('input', {
      bubbles: true,
      inputType: 'insertText',
      data: language
    })
  }
  return new EventCtor('input', { bubbles: true })
}

const markBridgeEvent = (event) => {
  Object.defineProperty(event, '__elephantCodeLanguageBridge', {
    configurable: true,
    value: true
  })
  return event
}

const updateStateWithoutDispatch = (state, language) => {
  if (!state || !language) return
  state.language = language
  replaceLanguageClass(state.pre, language)
  replaceLanguageClass(state.pre?.querySelector?.('code'), language)
  if (state.languageSelect && state.languageSelect.value !== language) {
    state.languageSelect.value = language
  }
  const source = state.pre?.querySelector?.('code')?.textContent || state.pre?.textContent || ''
  state.fingerprint = `${language}\u0000${source.replace(/\u00a0/g, ' ')}`
}

const writeNativeOnce = (target, state, language) => {
  const native = nativeControlForState(state)
  updateStateWithoutDispatch(state, language)
  if (!native) return false

  const previous = languageValue(native)
  if ('value' in native) native.value = language
  native.dataset.value = language
  if (!native.matches?.('input, select, textarea')) native.textContent = language

  if (previous === language) return true

  state.__codeLanguageBridgeSyncing = true
  try {
    native.dispatchEvent(markBridgeEvent(makeInputEvent(target, language)))
    native.dispatchEvent(markBridgeEvent(new target.Event('change', { bubbles: true })))
  } finally {
    state.__codeLanguageBridgeSyncing = false
  }
  return true
}

export const installExecutableCodeLanguageBridge = (target = globalThis) => {
  if (target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__) {
    return target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__
  }

  let runtime = null

  const onRuntimeSelectChange = (event) => {
    const select = event.target?.closest?.(RUNTIME_SELECT)
    if (!select || event.target !== select) return

    const state = runtime && stateForElement(runtime, select)
    if (!state) return

    // This capture listener owns runtime-select changes. Stopping the old V6
    // target listener prevents writeNativeLanguage() from dispatching a change
    // back onto the same select and recursing until stack exhaustion.
    event.stopImmediatePropagation()
    event.stopPropagation()

    if (state.__codeLanguageBridgeSyncing || event.__elephantCodeLanguageBridge) return
    const language = normalizeCodeLanguage(select.value)
    if (!language) return
    writeNativeOnce(target, state, language)
  }

  const onNativeLanguageChange = (event) => {
    const element = event.target
    if (!runtime || !element?.matches?.(NATIVE_LANGUAGE)) return
    if (element.matches?.(RUNTIME_SELECT) || element.closest?.(RUNTIME_UI)) return

    const state = stateForElement(runtime, element)
    if (!state || state.__codeLanguageBridgeSyncing) return
    const language = languageValue(element)
    if (!language) return
    updateStateWithoutDispatch(state, language)
  }

  document.addEventListener('change', onRuntimeSelectChange, true)
  document.addEventListener('input', onNativeLanguageChange, true)
  document.addEventListener('change', onNativeLanguageChange, true)

  const bridge = {
    bind(nextRuntime) {
      runtime = nextRuntime
      return nextRuntime
    },
    sync(state, language) {
      return writeNativeOnce(target, state, normalizeCodeLanguage(language))
    },
    dispose() {
      document.removeEventListener('change', onRuntimeSelectChange, true)
      document.removeEventListener('input', onNativeLanguageChange, true)
      document.removeEventListener('change', onNativeLanguageChange, true)
      runtime = null
      if (target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__ === bridge) {
        delete target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__
      }
    }
  }

  target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__ = bridge
  return bridge
}

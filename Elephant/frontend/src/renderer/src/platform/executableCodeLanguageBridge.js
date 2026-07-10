import {
  CODE_LANGUAGE_EVENT,
  registerExecutableCodeLanguageMuyaPlugin
} from './executableCodeLanguageMuyaPlugin'

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

const updateRuntimeState = (state, language) => {
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

const requestMuyaLanguageChange = (target, state, native, language) => {
  if (!native?.dispatchEvent || !native.id) return false
  const detail = {
    blockKey: native.id,
    language,
    handled: false
  }
  native.dispatchEvent(new target.CustomEvent(CODE_LANGUAGE_EVENT, {
    bubbles: true,
    detail
  }))
  return detail.handled === true
}

const updateNativeFallback = (native, language) => {
  if (!native) return false
  if ('value' in native) native.value = language
  native.dataset.value = language
  if (!native.matches?.('input, select, textarea')) native.textContent = language
  return true
}

const writeLanguageOnce = (target, state, language) => {
  const native = nativeControlForState(state)
  updateRuntimeState(state, language)

  state.__codeLanguageBridgeSyncing = true
  try {
    // The Muya plugin updates ContentState directly through updateCodeLanguage().
    // This is intentionally not an `input` event: synthetic keyboard events use
    // the current selection and previously caused recursive edits and corruption.
    if (requestMuyaLanguageChange(target, state, native, language)) return true
    return updateNativeFallback(native, language)
  } finally {
    state.__codeLanguageBridgeSyncing = false
  }
}

export const installExecutableCodeLanguageBridge = (target = globalThis) => {
  if (target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__) {
    return target.__ELEPHANT_CODE_LANGUAGE_BRIDGE__
  }

  registerExecutableCodeLanguageMuyaPlugin()
  let runtime = null

  const onRuntimeSelectChange = (event) => {
    const select = event.target?.closest?.(RUNTIME_SELECT)
    if (!select || event.target !== select) return

    const state = runtime && stateForElement(runtime, select)
    if (!state) return

    // The legacy V6 target listener redispatches `change` onto the same select.
    // This capture listener owns the transition and prevents that recursion.
    event.stopImmediatePropagation()
    event.stopPropagation()

    if (state.__codeLanguageBridgeSyncing) return
    const language = normalizeCodeLanguage(select.value)
    if (!language || language === state.language) return
    writeLanguageOnce(target, state, language)
  }

  const onNativeLanguageChange = (event) => {
    const element = event.target
    if (!runtime || !element?.matches?.(NATIVE_LANGUAGE)) return
    if (element.matches?.(RUNTIME_SELECT) || element.closest?.(RUNTIME_UI)) return

    const state = stateForElement(runtime, element)
    if (!state || state.__codeLanguageBridgeSyncing) return
    const language = languageValue(element)
    if (!language || language === state.language) return
    updateRuntimeState(state, language)
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
      const normalized = normalizeCodeLanguage(language)
      if (!normalized || normalized === state?.language) return false
      return writeLanguageOnce(target, state, normalized)
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

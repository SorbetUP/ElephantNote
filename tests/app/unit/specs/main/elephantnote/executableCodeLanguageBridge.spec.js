// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installExecutableCodeLanguageBridge,
  normalizeCodeLanguage
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeLanguageBridge'

const makeRuntime = () => {
  document.body.innerHTML = `
    <section class="ag-code-block en-code-v6-shell">
      <span class="ag-language-input">python</span>
      <div class="en-code-v6-toolbar" contenteditable="false">
        <select class="en-code-v6-language" aria-label="Code language">
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
      </div>
      <pre class="language-python"><code class="language-python">print("hello")</code></pre>
      <section class="en-code-v6-output" contenteditable="false"></section>
    </section>
  `

  const host = document.querySelector('.ag-code-block')
  const pre = host.querySelector('pre')
  const languageSelect = host.querySelector('.en-code-v6-language')
  const native = host.querySelector('.ag-language-input')
  const state = {
    id: 'block-1',
    host,
    pre,
    languageSelect,
    language: 'python',
    fingerprint: '',
    chrome: { languageControl: native }
  }
  return { runtime: { states: new Map([[state.id, state]]) }, state, native, languageSelect }
}

describe('executable code language bridge', () => {
  beforeEach(() => {
    globalThis.__ELEPHANT_CODE_LANGUAGE_BRIDGE__?.dispose?.()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    globalThis.__ELEPHANT_CODE_LANGUAGE_BRIDGE__?.dispose?.()
    document.body.innerHTML = ''
  })

  it('normalizes common fenced language forms', () => {
    expect(normalizeCodeLanguage(' Language-Python ')).toBe('python')
    expect(normalizeCodeLanguage('lang-JavaScript')).toBe('javascript')
  })

  it('blocks the legacy recursive select handler and notifies Muya once', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)

    const nativeInput = vi.fn()
    const nativeChange = vi.fn()
    native.addEventListener('input', nativeInput)
    native.addEventListener('change', nativeChange)

    const legacyHandler = vi.fn(() => {
      // This reproduces the former V6 failure: writeNativeLanguage() selected
      // the runtime select as its native target and dispatched change again.
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    languageSelect.addEventListener('change', legacyHandler)

    languageSelect.value = 'javascript'
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(legacyHandler).not.toHaveBeenCalled()
    expect(nativeInput).toHaveBeenCalledTimes(1)
    expect(nativeChange).toHaveBeenCalledTimes(1)
    expect(native.textContent).toBe('javascript')
    expect(native.dataset.value).toBe('javascript')
    expect(state.language).toBe('javascript')
    expect(state.pre.classList.contains('language-javascript')).toBe(true)
    expect(state.pre.querySelector('code').classList.contains('language-javascript')).toBe(true)
  })

  it('does not emit duplicate Muya events when selecting the same language', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)

    const nativeInput = vi.fn()
    const nativeChange = vi.fn()
    native.addEventListener('input', nativeInput)
    native.addEventListener('change', nativeChange)

    languageSelect.value = 'python'
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(nativeInput).not.toHaveBeenCalled()
    expect(nativeChange).not.toHaveBeenCalled()
  })

  it('mirrors a native Muya language change without dispatching back', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)

    native.textContent = 'javascript'
    native.dataset.value = 'javascript'
    native.dispatchEvent(new Event('input', { bubbles: true }))

    expect(languageSelect.value).toBe('javascript')
    expect(state.language).toBe('javascript')
    expect(state.pre.dataset.language).toBe('javascript')
  })
})

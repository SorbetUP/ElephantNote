// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installExecutableCodeLanguageBridge,
  normalizeCodeLanguage
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeLanguageBridge'
import {
  CODE_LANGUAGE_EVENT
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeLanguageMuyaPlugin'

const makeRuntime = () => {
  document.body.innerHTML = `
    <section class="ag-code-block en-code-v6-shell">
      <span id="language-block-1" class="ag-language-input">python</span>
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

const installFakeMuyaCommand = (host, native, handler = vi.fn()) => {
  host.addEventListener(CODE_LANGUAGE_EVENT, (event) => {
    handler(event.detail)
    native.textContent = event.detail.language
    native.dataset.value = event.detail.language
    event.detail.handled = true
  })
  return handler
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

  it('blocks the recursive V6 handler and sends one command to the real Muya control', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)

    // Reproduce the exact application bug: V6 remembered its own select as the
    // native language control. The bridge must reject it and find the Muya span.
    state.chrome.languageControl = languageSelect

    const command = installFakeMuyaCommand(state.host, native)
    const nativeInput = vi.fn()
    const nativeChange = vi.fn()
    native.addEventListener('input', nativeInput)
    native.addEventListener('change', nativeChange)

    const legacyHandler = vi.fn(() => {
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    languageSelect.addEventListener('change', legacyHandler)

    languageSelect.value = 'javascript'
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(legacyHandler).not.toHaveBeenCalled()
    expect(command).toHaveBeenCalledTimes(1)
    expect(command).toHaveBeenCalledWith(expect.objectContaining({
      blockKey: 'language-block-1',
      language: 'javascript'
    }))
    expect(nativeInput).not.toHaveBeenCalled()
    expect(nativeChange).not.toHaveBeenCalled()
    expect(native.textContent).toBe('javascript')
    expect(state.language).toBe('javascript')
    expect(state.pre.classList.contains('language-javascript')).toBe(true)
    expect(state.pre.querySelector('code').classList.contains('language-javascript')).toBe(true)
  })

  it('does nothing when selecting the current language', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)
    const command = installFakeMuyaCommand(state.host, native)

    languageSelect.value = 'python'
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(command).not.toHaveBeenCalled()
  })

  it('survives 200 language changes without recursion or keyboard events', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)
    const command = installFakeMuyaCommand(state.host, native)
    const nativeInput = vi.fn()
    const nativeChange = vi.fn()
    native.addEventListener('input', nativeInput)
    native.addEventListener('change', nativeChange)

    for (let index = 0; index < 200; index += 1) {
      languageSelect.value = index % 2 === 0 ? 'javascript' : 'python'
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    }

    expect(command).toHaveBeenCalledTimes(200)
    expect(nativeInput).not.toHaveBeenCalled()
    expect(nativeChange).not.toHaveBeenCalled()
    expect(state.language).toBe('python')
    expect(native.textContent).toBe('python')
    expect(state.pre.classList.contains('language-python')).toBe(true)
    expect(state.pre.querySelector('code').classList.contains('language-python')).toBe(true)
  })

  it('mirrors a genuine native Muya edit without dispatching back', () => {
    const bridge = installExecutableCodeLanguageBridge(globalThis)
    const { runtime, state, native, languageSelect } = makeRuntime()
    bridge.bind(runtime)
    const command = installFakeMuyaCommand(state.host, native)

    native.textContent = 'javascript'
    native.dataset.value = 'javascript'
    native.dispatchEvent(new Event('input', { bubbles: true }))

    expect(command).not.toHaveBeenCalled()
    expect(languageSelect.value).toBe('javascript')
    expect(state.language).toBe('javascript')
    expect(state.pre.dataset.language).toBe('javascript')
  })
})

import './executableCodeNativeRuntime.css'

const ROOT_SELECTOR = '.muya-container, .en-editor-host, .ag-editor'
const OUTPUT_TAG = 'elephant-code-output'
const DEFAULT_OUTPUT_LINES = 200
const RUN_TIMEOUT_MS = 22_000
const STOP_TIMEOUT_MS = 10_000
const DETACHED_TTL_MS = 1000

let executionSequence = 0

const errorMessage = (error) => error?.message || String(error || 'Unknown error')
const byteLength = (value = '') => {
  try { return new TextEncoder().encode(String(value)).byteLength } catch { return String(value).length }
}
const normalizeLanguage = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/^language-/, '')
  .replace(/^lang-/, '')

const withTimeout = (promise, timeoutMs, label) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const invokePrograms = async(target, action, payload = {}) => {
  const invoke = target?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') {
    throw new Error('The Tauri command API is unavailable for code execution.')
  }

  if (action === 'list') return invoke('tauri_programs_list')
  if (action === 'set') return invoke('tauri_programs_set', { environments: payload })

  const request = action === 'stop'
    ? { id: '', command: '', cwd: null, executionId: payload.executionId, stop: true }
    : {
        id: payload.id,
        command: payload.command,
        cwd: payload.cwd || null,
        executionId: payload.executionId,
        stop: false
      }
  const timeoutMs = action === 'run' ? RUN_TIMEOUT_MS : STOP_TIMEOUT_MS
  return withTimeout(
    Promise.resolve(invoke('tauri_programs_run', request)),
    timeoutMs,
    `Code execution IPC did not answer within ${timeoutMs} ms.`
  )
}

const installProgramsApi = (target) => {
  target.elephantnote = target.elephantnote || {}
  target.elephantnote.programs = {
    list: () => invokePrograms(target, 'list'),
    set: (payload = {}) => invokePrograms(target, 'set', payload.environments || payload),
    run: (payload = {}) => invokePrograms(target, 'run', payload),
    stop: (payload = {}) => invokePrograms(target, 'stop', payload)
  }

  const api = target.elephantnote.api
  if (!api?.call || api.call.__elephantProgramsPatched) return
  const original = api.call.bind(api)
  const patched = async(action, payload = {}) => {
    if (action === 'programs.list') return { ok: true, data: await invokePrograms(target, 'list') }
    if (action === 'programs.set') {
      return { ok: true, data: await invokePrograms(target, 'set', payload.environments || payload) }
    }
    if (action === 'programs.run') return { ok: true, data: await invokePrograms(target, 'run', payload) }
    if (action === 'programs.stop') return { ok: true, data: await invokePrograms(target, 'stop', payload) }
    return original(action, payload)
  }
  patched.__elephantProgramsPatched = true
  api.call = patched
}

const languageFromPre = (pre) => {
  const native = pre?.querySelector?.('.ag-language-input')
  const explicit = native?.textContent || native?.dataset?.value || pre?.dataset?.language
  if (explicit) return normalizeLanguage(explicit)
  for (const className of pre?.classList || []) {
    if (className.startsWith('language-')) return normalizeLanguage(className.slice(9))
  }
  return ''
}

const sourceFromPre = (pre) => String(
  pre?.querySelector?.('code')?.innerText ??
  pre?.querySelector?.('code')?.textContent ??
  ''
).replace(/\u00a0/g, ' ')

const outputText = (result = {}) => [result.stdout, result.stderr || result.error]
  .filter(Boolean)
  .join('\n')

const copyText = async(target, text) => {
  if (target.navigator?.clipboard?.writeText) return target.navigator.clipboard.writeText(text)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand?.('copy')
  textarea.remove()
}

const outputStyles = `
  :host {
    display: block;
    box-sizing: border-box;
    width: 100%;
    color: inherit;
    font-family: var(--font-family, system-ui, sans-serif);
  }
  :host([hidden]) { display: none !important; }
  .panel {
    border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
    background: color-mix(in srgb, var(--editorBgColor, #29292c) 96%, currentColor 4%);
  }
  .panel.error { border-top-color: color-mix(in srgb, #e05252 58%, transparent); }
  header {
    display: flex;
    min-height: 38px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 9px 5px 12px;
    border-bottom: 1px solid color-mix(in srgb, currentColor 7%, transparent);
  }
  .identity, .actions { display: flex; align-items: center; }
  .identity { min-width: 0; gap: 7px; font-size: 12px; }
  .actions { flex: 0 0 auto; gap: 2px; }
  .dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #22a657; }
  .running .dot { background: var(--primary-color, #1687ff); }
  .error .dot { background: #e05252; }
  .meta { overflow: hidden; color: color-mix(in srgb, currentColor 48%, transparent); text-overflow: ellipsis; white-space: nowrap; }
  button {
    padding: 4px 7px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: color-mix(in srgb, currentColor 60%, transparent);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; }
  button:disabled { opacity: .35; cursor: default; }
  .body { max-height: 300px; overflow: auto; padding: 10px 12px 12px; }
  .stream + .stream { margin-top: 10px; }
  .label { margin-bottom: 4px; color: color-mix(in srgb, currentColor 45%, transparent); font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
  .stream.error .label { color: #e05252; }
  pre { margin: 0; padding: 0; overflow: visible; border: 0; background: transparent; color: inherit; font: 12px/1.55 var(--codeFontFamily, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre-wrap; word-break: break-word; }
  .empty { margin: 0; color: color-mix(in srgb, currentColor 52%, transparent); font-size: 12px; }
  .progress { height: 2px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--primary-color, #1687ff) 16%, transparent); }
  .progress::after { content: ''; display: block; width: 36%; height: 100%; border-radius: inherit; background: var(--primary-color, #1687ff); animation: progress 1s ease-in-out infinite alternate; }
  @keyframes progress { from { transform: translateX(-20%); } to { transform: translateX(220%); } }
`

const createOutputElementClass = (target) => class ElephantCodeOutputElement extends target.HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    target.__ELEPHANT_NATIVE_CODE_RUNTIME__?.registerOutput(this)
  }

  disconnectedCallback() {
    target.__ELEPHANT_NATIVE_CODE_RUNTIME__?.unregisterOutput(this)
  }

  renderState(state, runtime) {
    const shadow = this.shadowRoot
    shadow.replaceChildren()
    const style = document.createElement('style')
    style.textContent = outputStyles
    shadow.append(style)

    const visible = state.status !== 'idle' || Boolean(state.result)
    this.hidden = !visible
    if (!visible) return

    const running = state.status === 'running' || state.status === 'stopping'
    const result = state.result || {}
    const panel = document.createElement('section')
    panel.className = `panel${running ? ' running' : ''}${!running && result.success !== true && !result.interrupted ? ' error' : ''}`

    const header = document.createElement('header')
    const identity = document.createElement('div')
    identity.className = 'identity'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const title = document.createElement('strong')
    title.textContent = running
      ? (state.status === 'stopping' ? 'Stopping' : 'Running')
      : result.interrupted ? 'Stopped' : result.success ? 'Output' : 'Error'
    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = running ? state.language : [
      result.environment || result.language || state.language,
      Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
      result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
      result.timedOut ? 'timed out' : '',
      result.truncated ? `last ${result.outputLineLimit || DEFAULT_OUTPUT_LINES} lines` : ''
    ].filter(Boolean).join(' · ')
    identity.append(dot, title, meta)

    const actions = document.createElement('div')
    actions.className = 'actions'
    const copy = document.createElement('button')
    const collapse = document.createElement('button')
    const clear = document.createElement('button')
    copy.type = collapse.type = clear.type = 'button'
    copy.textContent = 'Copy'
    collapse.textContent = state.collapsed ? 'Expand' : 'Collapse'
    clear.textContent = 'Clear'
    copy.disabled = running || !outputText(result)
    collapse.disabled = clear.disabled = running
    copy.addEventListener('click', async() => {
      try {
        await copyText(target, outputText(result))
        copy.textContent = 'Copied'
        setTimeout(() => { copy.textContent = 'Copy' }, 900)
      } catch { copy.textContent = 'Copy failed' }
    })
    collapse.addEventListener('click', () => runtime.setCollapsed(state, !state.collapsed))
    clear.addEventListener('click', () => runtime.clear(state))
    actions.append(copy, collapse, clear)
    header.append(identity, actions)
    panel.append(header)

    const body = document.createElement('div')
    body.className = 'body'
    body.hidden = state.collapsed
    if (running) {
      const progress = document.createElement('div')
      progress.className = 'progress'
      body.append(progress)
    } else {
      const appendStream = (labelText, value, isError = false) => {
        if (!value) return
        const stream = document.createElement('section')
        stream.className = `stream${isError ? ' error' : ''}`
        const label = document.createElement('div')
        label.className = 'label'
        label.textContent = labelText
        const pre = document.createElement('pre')
        pre.textContent = value
        stream.append(label, pre)
        body.append(stream)
      }
      appendStream('stdout', result.stdout)
      appendStream('stderr', result.stderr || result.error, true)
      if (!result.stdout && !result.stderr && !result.error) {
        const empty = document.createElement('p')
        empty.className = 'empty'
        empty.textContent = result.interrupted
          ? 'The program was stopped before producing output.'
          : 'The program completed without output.'
        body.append(empty)
      }
    }
    panel.append(body)
    shadow.append(panel)
  }
}

const defineOutputElement = (target) => {
  if (!target.customElements || target.customElements.get(OUTPUT_TAG)) return
  target.customElements.define(OUTPUT_TAG, createOutputElementClass(target))
}

export const installExecutableCodeNativeRuntime = (target = globalThis) => {
  const existing = target.__ELEPHANT_NATIVE_CODE_RUNTIME__
  if (existing) return existing

  installProgramsApi(target)
  defineOutputElement(target)

  const states = new Map()
  const roots = new WeakMap()
  let rootSequence = 0
  let disposed = false

  const rootId = (element) => {
    const root = element?.closest?.(ROOT_SELECTOR) || document.documentElement
    if (!roots.has(root)) roots.set(root, `editor-${++rootSequence}`)
    return roots.get(root)
  }
  const stateKey = (element) => `${rootId(element)}:${element.dataset.blockKey || element.closest('pre')?.id || ''}`
  const ensureState = (element) => {
    const key = stateKey(element)
    let state = states.get(key)
    if (!state) {
      state = {
        key,
        blockKey: element.dataset.blockKey || element.closest('pre')?.id || '',
        pre: null,
        runButton: null,
        output: null,
        status: 'idle',
        result: null,
        executionId: null,
        language: '',
        collapsed: false,
        detachTimer: null
      }
      states.set(key, state)
    }
    if (state.detachTimer) {
      clearTimeout(state.detachTimer)
      state.detachTimer = null
    }
    state.pre = element.closest('pre')
    state.runButton = state.pre?.querySelector?.('.en-code-native-run') || null
    state.output = element.matches?.(OUTPUT_TAG) ? element : state.pre?.querySelector?.(OUTPUT_TAG)
    state.language = languageFromPre(state.pre) || state.language
    state.pre?.classList?.add('en-code-native-shell')
    return state
  }
  const updateRunButton = (state) => {
    const button = state.runButton || state.pre?.querySelector?.('.en-code-native-run')
    if (!button) return
    state.runButton = button
    const running = state.status === 'running' || state.status === 'stopping'
    button.classList.toggle('is-running', running)
    button.classList.toggle('is-stopping', state.status === 'stopping')
    button.setAttribute('aria-label', running ? 'Stop code execution' : 'Run code block')
    button.title = running ? (state.status === 'stopping' ? 'Stopping…' : 'Stop execution') : 'Run code block'
  }
  const render = (state) => {
    updateRunButton(state)
    state.output?.renderState?.(state, runtime)
  }
  const clear = (state) => {
    state.status = 'idle'
    state.result = null
    state.collapsed = false
    render(state)
  }
  const setCollapsed = (state, collapsed) => {
    state.collapsed = collapsed
    render(state)
  }
  const stop = async(state) => {
    if (!state.executionId || state.status === 'stopping') return
    const executionId = state.executionId
    state.status = 'stopping'
    render(state)
    try {
      const result = await invokePrograms(target, 'stop', { executionId })
      if (!result?.stopped && state.executionId === executionId) state.status = 'running'
    } catch (error) {
      if (state.executionId === executionId) state.status = 'running'
      state.result = { success: false, error: errorMessage(error), language: state.language }
    }
    render(state)
  }
  const run = async(state) => {
    if (state.status === 'running' || state.status === 'stopping') return stop(state)
    state.pre = state.output?.closest?.('pre') || state.runButton?.closest?.('pre') || state.pre
    state.language = languageFromPre(state.pre)
    const source = sourceFromPre(state.pre)
    if (!state.language) {
      state.status = 'done'
      state.result = { success: false, error: 'Choose a language before running this block.' }
      return render(state)
    }

    const executionId = `execution-${Date.now().toString(36)}-${++executionSequence}`
    state.executionId = executionId
    state.status = 'running'
    state.result = null
    state.collapsed = false
    render(state)
    console.info('[Code:UI] run:dispatch', {
      blockKey: state.blockKey,
      executionId,
      language: state.language,
      codeBytes: byteLength(source)
    })
    try {
      const result = await invokePrograms(target, 'run', {
        id: state.language,
        command: source,
        executionId
      })
      if (state.executionId !== executionId) return
      state.result = result
      state.status = 'done'
    } catch (error) {
      if (state.executionId !== executionId) return
      state.status = 'done'
      state.result = { success: false, language: state.language, error: errorMessage(error) }
    } finally {
      if (state.executionId === executionId) state.executionId = null
      render(state)
    }
  }
  const registerOutput = (element) => {
    if (disposed) return
    const state = ensureState(element)
    render(state)
  }
  const unregisterOutput = (element) => {
    const key = stateKey(element)
    const state = states.get(key)
    if (!state || state.output !== element) return
    state.output = null
    state.detachTimer = setTimeout(() => {
      if (state.output?.isConnected) return
      if (state.executionId) void invokePrograms(target, 'stop', { executionId: state.executionId })
      states.delete(key)
    }, DETACHED_TTL_MS)
  }
  const stateForControl = (control) => {
    const output = control.closest('pre')?.querySelector?.(OUTPUT_TAG)
    return output ? ensureState(output) : null
  }
  const onClick = (event) => {
    const button = event.target?.closest?.('.en-code-native-run')
    if (!button) return
    event.preventDefault()
    event.stopPropagation()
    const state = stateForControl(button)
    if (state) void run(state)
  }
  const onKeyDown = (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
    const pre = event.target?.closest?.('pre.ag-fence-code')
    if (!pre) return
    const output = pre.querySelector(OUTPUT_TAG)
    if (!output) return
    event.preventDefault()
    event.stopPropagation()
    const state = ensureState(output)
    void run(state)
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown, true)

  const runtime = {
    version: 'native-v1',
    states,
    registerOutput,
    unregisterOutput,
    run,
    stop,
    clear,
    setCollapsed,
    dispose() {
      disposed = true
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      for (const state of states.values()) {
        if (state.detachTimer) clearTimeout(state.detachTimer)
        if (state.executionId) void invokePrograms(target, 'stop', { executionId: state.executionId })
      }
      states.clear()
      if (target.__ELEPHANT_NATIVE_CODE_RUNTIME__ === runtime) {
        delete target.__ELEPHANT_NATIVE_CODE_RUNTIME__
      }
    }
  }

  target.__ELEPHANT_NATIVE_CODE_RUNTIME__ = runtime
  document.querySelectorAll(OUTPUT_TAG).forEach(registerOutput)
  console.info('[Code:UI] install:complete', { runtime: runtime.version })
  return runtime
}

export const resetExecutableCodeNativeRuntimeForTests = (target = globalThis) => {
  target.__ELEPHANT_NATIVE_CODE_RUNTIME__?.dispose?.()
  executionSequence = 0
}

import './executableCodeBlocks.v2.css'
import { applyLanguageUiState, relevantLanguageMutations } from './executableCodeBlockObserver'
import {
  indentationEdit,
  indentationForNewline,
  normalizeOutputLineLimit
} from './executableCodeEditing'

const ENHANCED_ATTRIBUTE = 'data-elephant-code-runner'
const HOST_ATTRIBUTE = 'data-elephant-code-host'
const OUTPUT_ATTRIBUTE = 'data-elephant-code-output'
const TOOLBAR_ATTRIBUTE = 'data-elephant-code-toolbar'
const SETTINGS_ATTRIBUTE = 'data-elephant-code-settings'
const BLOCK_ID_ATTRIBUTE = 'data-elephant-code-block-id'
const LANGUAGE_CLASS_PREFIXES = ['language-', 'lang-']
const RUN_WATCHDOG_MS = 22_000
const IPC_WATCHDOG_MS = 10_000
const DEFAULT_OUTPUT_LINE_LIMIT = 200
const DETACHED_STATE_GRACE_MS = 2_000
const CODE_HOST_SELECTOR = [
  '[data-code-block]',
  '[data-role="code-block"]',
  '[data-type="code-block"]',
  '.ag-code-block',
  '.code-block'
].join(', ')
const LANGUAGE_INPUT_SELECTOR = [
  '.ag-language-input',
  '.language-input',
  '.ag-code-language',
  '.code-block-language',
  '[data-function-type="languageInput"]',
  '[functiontype="languageInput"]',
  '[data-role="language-input"]',
  '[data-language-input]',
  '[data-placeholder*="language" i]',
  '[placeholder*="language" i]',
  '[aria-label*="language" i]'
].join(', ')

let requestSequence = 0
let blockSequence = 0
let runtimeSettings = { outputLineLimit: DEFAULT_OUTPUT_LINE_LIMIT }
const blockStates = new Map()
const blockObservers = new WeakMap()

const nowMs = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now())
const elapsedMs = (started) => Math.max(0, Math.round(nowMs() - started))
const byteLength = (value = '') => {
  try {
    return new TextEncoder().encode(String(value)).byteLength
  } catch {
    return String(value).length
  }
}
const errorMessage = (error) => error?.message || String(error || 'Unknown error')
const nextRequestId = (action) => `${action}-${Date.now().toString(36)}-${++requestSequence}`
const nextExecutionId = () => `execution-${Date.now().toString(36)}-${++requestSequence}`

const logCode = (level, event, details = {}) => {
  const method = console[level] || console.log
  method.call(console, `[Code:UI] ${event}`, details)
}

const describeElement = (element) => {
  if (!element) return null
  return {
    tag: String(element.tagName || '').toLowerCase(),
    className: String(element.className || '').slice(0, 240),
    role: element.getAttribute?.('role') || '',
    placeholder: element.getAttribute?.('placeholder') || element.getAttribute?.('data-placeholder') || '',
    ariaLabel: element.getAttribute?.('aria-label') || ''
  }
}

const getInvoke = (target = globalThis) => target?.__TAURI__?.core?.invoke

const updateRuntimeSettings = (value) => {
  if (value?.outputLineLimit !== undefined) {
    runtimeSettings.outputLineLimit = normalizeOutputLineLimit(
      value.outputLineLimit,
      runtimeSettings.outputLineLimit
    )
  }
}

const withWatchdog = (promise, timeoutMs, message, onTimeout) => {
  let timer = null
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(new Error(message))
    }, timeoutMs)
  })
  return Promise.race([promise, watchdog]).finally(() => clearTimeout(timer))
}

const invokePrograms = async(target, action, payload = {}) => {
  const invoke = getInvoke(target)
  const requestId = nextRequestId(action)
  const started = nowMs()
  const language = String(payload.id || '')
  const command = String(payload.command ?? payload.code ?? '')
  const timeoutMs = action === 'run' ? RUN_WATCHDOG_MS : IPC_WATCHDOG_MS

  logCode('info', 'invoke:start', {
    requestId,
    action,
    executionId: payload.executionId || null,
    language,
    commandBytes: action === 'run' ? byteLength(command) : 0,
    cwd: payload.cwd || null,
    timeoutMs
  })

  if (typeof invoke !== 'function') {
    throw new Error('The Tauri command API is unavailable for code execution.')
  }

  let invocation
  if (action === 'list') invocation = invoke('tauri_programs_list')
  else if (action === 'set') invocation = invoke('tauri_programs_set', { environments: payload })
  else if (action === 'run') {
    invocation = invoke('tauri_programs_run', {
      id: language,
      command,
      cwd: payload.cwd || null,
      executionId: payload.executionId || null,
      stop: false
    })
  } else if (action === 'stop') {
    invocation = invoke('tauri_programs_run', {
      id: '',
      command: '',
      cwd: null,
      executionId: payload.executionId,
      stop: true
    })
  } else {
    throw new Error(`Unsupported programs action: ${action}`)
  }

  try {
    const result = await withWatchdog(
      Promise.resolve(invocation),
      timeoutMs,
      `Code execution IPC did not answer within ${timeoutMs} ms. Check the [Code] backend logs.`,
      () => logCode('error', 'invoke:watchdog-timeout', {
        requestId,
        action,
        executionId: payload.executionId || null,
        timeoutMs
      })
    )
    updateRuntimeSettings(result)
    logCode('info', 'invoke:complete', {
      requestId,
      action,
      executionId: payload.executionId || result?.executionId || null,
      language,
      durationMs: elapsedMs(started),
      success: result?.success,
      stopped: result?.stopped,
      interrupted: result?.interrupted,
      exitCode: result?.exitCode,
      timedOut: result?.timedOut,
      truncated: result?.truncated,
      stdoutBytes: byteLength(result?.stdout || ''),
      stderrBytes: byteLength(result?.stderr || '')
    })
    return result
  } catch (error) {
    logCode('error', 'invoke:error', {
      requestId,
      action,
      executionId: payload.executionId || null,
      language,
      durationMs: elapsedMs(started),
      error: errorMessage(error)
    })
    throw error
  }
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
  const originalCall = api.call.bind(api)
  const patchedCall = async(action, payload = {}) => {
    if (action === 'programs.list') return { ok: true, data: await invokePrograms(target, 'list') }
    if (action === 'programs.set') {
      return { ok: true, data: await invokePrograms(target, 'set', payload.environments || payload) }
    }
    if (action === 'programs.run') return { ok: true, data: await invokePrograms(target, 'run', payload) }
    if (action === 'programs.stop') return { ok: true, data: await invokePrograms(target, 'stop', payload) }
    return originalCall(action, payload)
  }
  patchedCall.__elephantProgramsPatched = true
  api.call = patchedCall
  logCode('info', 'api:patched', {
    actions: ['programs.list', 'programs.set', 'programs.run', 'programs.stop']
  })
}

const normalizeLanguage = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^language-/, '')
    .replace(/^lang-/, '')

const languageFromClasses = (element) => {
  for (const className of element?.classList || []) {
    const prefix = LANGUAGE_CLASS_PREFIXES.find((item) => className.startsWith(item))
    if (prefix) return normalizeLanguage(className.slice(prefix.length))
  }
  return ''
}

const valueFromLanguageNode = (node) => {
  if (!node) return ''
  const value = typeof node.value === 'string' ? node.value : ''
  return normalizeLanguage(
    value ||
    node.getAttribute?.('data-value') ||
    node.getAttribute?.('value') ||
    node.textContent ||
    ''
  )
}

const findLanguageInput = (pre) => {
  const roots = [
    pre,
    pre.parentElement,
    pre.closest?.(CODE_HOST_SELECTOR),
    pre.previousElementSibling,
    pre.parentElement?.previousElementSibling
  ].filter(Boolean)

  for (const root of roots) {
    if (root.matches?.(LANGUAGE_INPUT_SELECTOR)) return root
    const found = root.querySelector?.(LANGUAGE_INPUT_SELECTOR)
    if (found && !found.closest?.('.en-code-runner-toolbar')) return found
  }
  return null
}

const languageFromBlock = (pre) => {
  const code = pre?.querySelector?.('code')
  const explicit =
    pre?.dataset?.language ||
    pre?.dataset?.lang ||
    pre?.getAttribute?.('lang') ||
    code?.dataset?.language ||
    code?.dataset?.lang ||
    code?.getAttribute?.('lang') ||
    languageFromClasses(pre) ||
    languageFromClasses(code)
  if (explicit) return normalizeLanguage(explicit)
  return valueFromLanguageNode(findLanguageInput(pre))
}

const codeFromBlock = (pre) => {
  const code = pre?.querySelector?.('code')
  return String(code?.innerText || pre?.innerText || '').replace(/\u00a0/g, ' ')
}

const editorBlocks = () =>
  [...document.querySelectorAll('.en-editor-host pre, .muya-container pre, .ag-editor pre')]
    .filter((pre) => !pre.closest?.(`[${OUTPUT_ATTRIBUTE}]`))

const ordinalFor = (pre) => editorBlocks().indexOf(pre)
const fingerprintFor = (pre) => `${languageFromBlock(pre)}\u0000${codeFromBlock(pre)}`

const runnerHostFor = (pre) => {
  const explicit = pre.closest?.(CODE_HOST_SELECTOR)
  if (explicit && explicit !== pre) return explicit
  const parent = pre.parentElement
  const className = String(parent?.className || '')
  if (parent && (/code/i.test(className) || parent.querySelector?.(LANGUAGE_INPUT_SELECTOR))) {
    return parent
  }
  return pre
}

const stateFor = (pre) => {
  const host = runnerHostFor(pre)
  let blockId = pre.getAttribute(BLOCK_ID_ATTRIBUTE) || host.getAttribute?.(BLOCK_ID_ATTRIBUTE) || ''
  const fingerprint = fingerprintFor(pre)
  const ordinal = ordinalFor(pre)

  if (!blockId) {
    const now = Date.now()
    const candidate = [...blockStates.values()].find((state) =>
      !state.host?.isConnected &&
      now - state.lastSeenAt <= DETACHED_STATE_GRACE_MS &&
      (state.fingerprint === fingerprint || state.ordinal === ordinal)
    )
    blockId = candidate?.id || `block-${++blockSequence}`
  }

  let state = blockStates.get(blockId)
  if (!state) {
    state = {
      id: blockId,
      status: 'idle',
      result: null,
      executionId: null,
      pre: null,
      host: null,
      toolbar: null,
      output: null,
      language: '',
      fingerprint: '',
      ordinal: -1,
      lastSeenAt: Date.now()
    }
    blockStates.set(blockId, state)
  }

  state.pre = pre
  state.host = host
  state.language = languageFromBlock(pre)
  state.fingerprint = fingerprint
  state.ordinal = ordinal
  state.lastSeenAt = Date.now()
  pre.setAttribute(BLOCK_ID_ATTRIBUTE, blockId)
  host.setAttribute?.(BLOCK_ID_ATTRIBUTE, blockId)
  host.setAttribute?.(HOST_ATTRIBUTE, 'true')
  pre.setAttribute(ENHANCED_ATTRIBUTE, 'true')
  return state
}

const toolbarForState = (target, state) => {
  const host = state.host
  let toolbar = state.toolbar?.isConnected ? state.toolbar : null
  if (!toolbar && host !== state.pre) toolbar = host.querySelector?.(`:scope > [${TOOLBAR_ATTRIBUTE}]`)
  if (!toolbar && host === state.pre) {
    const next = state.pre.nextElementSibling
    if (next?.hasAttribute?.(TOOLBAR_ATTRIBUTE)) toolbar = next
  }

  if (!toolbar) {
    toolbar = document.createElement('div')
    const language = document.createElement('span')
    const button = document.createElement('button')
    const icon = document.createElement('span')
    toolbar.className = 'en-code-runner-toolbar'
    toolbar.setAttribute(TOOLBAR_ATTRIBUTE, 'true')
    toolbar.contentEditable = 'false'
    language.className = 'en-code-runner-language'
    button.className = 'en-code-runner-run'
    button.type = 'button'
    icon.className = 'en-code-runner-run-icon'
    button.append(icon)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const current = blockStates.get(toolbar.getAttribute(BLOCK_ID_ATTRIBUTE))
      if (!current) return
      if (current.status === 'running' || current.status === 'stopping') {
        void stopBlock(target, current)
      } else {
        void runBlock(target, current)
      }
    })
    toolbar.append(language, button)
    if (host !== state.pre) host.append(toolbar)
    else {
      toolbar.classList.add('is-fallback')
      state.pre.insertAdjacentElement('afterend', toolbar)
    }
  }

  toolbar.setAttribute(BLOCK_ID_ATTRIBUTE, state.id)
  state.toolbar = toolbar
  renderToolbar(state)
  return toolbar
}

const renderToolbar = (state) => {
  const toolbar = state.toolbar
  if (!toolbar) return
  const language = toolbar.querySelector('.en-code-runner-language')
  const button = toolbar.querySelector('.en-code-runner-run')
  const icon = button?.querySelector('.en-code-runner-run-icon')
  const isRunning = state.status === 'running' || state.status === 'stopping'
  language.textContent = state.language || 'Code'
  toolbar.classList.toggle('has-language', Boolean(state.language))
  button.disabled = !state.language && !isRunning
  button.classList.toggle('is-running', isRunning)
  button.classList.toggle('is-stopping', state.status === 'stopping')
  button.setAttribute('aria-label', isRunning ? 'Stop code execution' : 'Run code block')
  button.title = isRunning
    ? state.status === 'stopping' ? 'Stopping…' : 'Stop execution'
    : 'Run code block · Cmd/Ctrl+Enter'
  icon.textContent = isRunning ? '' : '▶'
}

const outputAnchorFor = (state) => state.host !== state.pre ? state.host : state.toolbar || state.pre

const ensureOutput = (state) => {
  let output = state.output?.isConnected ? state.output : null
  if (!output) {
    output = [...document.querySelectorAll(`[${OUTPUT_ATTRIBUTE}]`)]
      .find((candidate) => candidate.getAttribute(BLOCK_ID_ATTRIBUTE) === state.id)
  }
  if (!output) {
    output = document.createElement('section')
    output.setAttribute(OUTPUT_ATTRIBUTE, 'true')
    output.setAttribute(BLOCK_ID_ATTRIBUTE, state.id)
    output.className = 'en-code-output'
    output.contentEditable = 'false'
  }
  const anchor = outputAnchorFor(state)
  if (anchor?.isConnected && output.previousElementSibling !== anchor) {
    anchor.insertAdjacentElement('afterend', output)
  }
  state.output = output
  return output
}

const copyText = async(text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

const renderOutput = (state) => {
  if (state.status === 'idle' && !state.result) {
    state.output?.remove()
    state.output = null
    return
  }

  const output = ensureOutput(state)
  const result = state.result || {}
  const running = state.status === 'running' || state.status === 'stopping'
  const lineLimit = normalizeOutputLineLimit(result.outputLineLimit, runtimeSettings.outputLineLimit)
  output.hidden = false
  output.classList.toggle('is-running', running)
  output.classList.toggle('is-error', !running && result.success !== true && !result.interrupted)
  output.classList.toggle('is-interrupted', result.interrupted === true)
  output.replaceChildren()

  const header = document.createElement('header')
  const identity = document.createElement('div')
  const status = document.createElement('span')
  const copy = document.createElement('div')
  const title = document.createElement('strong')
  const meta = document.createElement('span')
  const actions = document.createElement('div')
  const copyButton = document.createElement('button')
  const collapseButton = document.createElement('button')
  const clearButton = document.createElement('button')

  identity.className = 'en-code-output-identity'
  status.className = 'en-code-output-status'
  copy.className = 'en-code-output-copy'
  title.textContent = running
    ? state.status === 'stopping' ? 'Stopping' : 'Running'
    : result.interrupted ? 'Stopped'
      : result.success ? 'Output' : 'Execution failed'
  meta.textContent = running
    ? `${state.language || 'Code'} · ${state.status === 'stopping' ? 'interrupt requested' : 'local runtime'}`
    : [
        result.environment || result.language || state.language || '',
        Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
        result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
        result.interrupted ? 'interrupted' : '',
        result.timedOut ? 'timed out' : '',
        result.truncated ? `last ${lineLimit} lines` : ''
      ].filter(Boolean).join(' · ')
  identity.append(status, copy)
  copy.append(title, meta)

  actions.className = 'en-code-output-actions'
  copyButton.type = 'button'
  copyButton.textContent = 'Copy'
  copyButton.disabled = running || (!result.stdout && !result.stderr && !result.error)
  copyButton.addEventListener('click', async() => {
    const value = [result.stdout, result.stderr || result.error].filter(Boolean).join('\n')
    try {
      await copyText(value)
      copyButton.textContent = 'Copied'
      setTimeout(() => { copyButton.textContent = 'Copy' }, 1200)
    } catch (error) {
      copyButton.textContent = 'Copy failed'
      logCode('error', 'output:copy:error', { blockId: state.id, error: errorMessage(error) })
    }
  })
  collapseButton.type = 'button'
  collapseButton.textContent = 'Collapse'
  collapseButton.disabled = running
  collapseButton.setAttribute('aria-expanded', 'true')
  clearButton.type = 'button'
  clearButton.textContent = 'Clear'
  clearButton.disabled = running
  clearButton.addEventListener('click', () => {
    state.result = null
    state.status = 'idle'
    output.remove()
    state.output = null
    renderToolbar(state)
    logCode('info', 'output:cleared', { blockId: state.id })
  })
  actions.append(copyButton, collapseButton, clearButton)
  header.append(identity, actions)
  output.append(header)

  const body = document.createElement('div')
  body.className = 'en-code-output-body'
  collapseButton.addEventListener('click', () => {
    const collapsed = !body.hidden
    body.hidden = collapsed
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'
    collapseButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    output.classList.toggle('is-collapsed', collapsed)
  })
  output.append(body)

  if (running) {
    const progress = document.createElement('div')
    progress.className = 'en-code-output-progress'
    progress.setAttribute('aria-label', 'Code execution in progress')
    body.append(progress)
    return
  }

  if (result.truncated) {
    const notice = document.createElement('p')
    notice.className = 'en-code-output-notice'
    notice.textContent = `Earlier output was discarded. Showing the last ${lineLimit} lines from a bounded buffer.`
    body.append(notice)
  }

  const streams = []
  const appendStream = (label, value, className, lineCount) => {
    if (!value) return
    const stream = document.createElement('section')
    const streamHeader = document.createElement('div')
    const streamLabel = document.createElement('strong')
    const streamMeta = document.createElement('span')
    const text = document.createElement('pre')
    stream.className = `en-code-output-stream ${className}`
    streamHeader.className = 'en-code-output-stream-header'
    streamLabel.textContent = label
    streamMeta.textContent = Number.isFinite(Number(lineCount))
      ? `${lineCount} line${Number(lineCount) === 1 ? '' : 's'}`
      : ''
    text.textContent = value
    streamHeader.append(streamLabel, streamMeta)
    stream.append(streamHeader, text)
    body.append(stream)
    streams.push(text)
  }
  appendStream('stdout', result.stdout, 'en-code-output-stdout', result.stdoutLines)
  appendStream('stderr', result.stderr || result.error, 'en-code-output-stderr', result.stderrLines)
  if (!result.stdout && !result.stderr && !result.error) {
    const empty = document.createElement('p')
    empty.className = 'en-code-output-empty'
    empty.textContent = result.interrupted
      ? 'The program was stopped before it produced output.'
      : 'The program completed without producing output.'
    body.append(empty)
  }
  requestAnimationFrame(() => streams.forEach((stream) => { stream.scrollTop = stream.scrollHeight }))
}

const stopBlock = async(target, state) => {
  if (!state.executionId || state.status === 'stopping') return
  const executionId = state.executionId
  state.status = 'stopping'
  renderToolbar(state)
  renderOutput(state)
  logCode('info', 'stop:dispatch', { blockId: state.id, executionId })
  try {
    const result = await invokePrograms(target, 'stop', { executionId })
    logCode(result?.stopped ? 'info' : 'warn', 'stop:result', {
      blockId: state.id,
      executionId,
      stopped: result?.stopped === true
    })
    if (!result?.stopped && state.executionId === executionId) {
      state.status = 'running'
      renderToolbar(state)
      renderOutput(state)
    }
  } catch (error) {
    if (state.executionId === executionId) state.status = 'running'
    renderToolbar(state)
    renderOutput(state)
    logCode('error', 'stop:error', {
      blockId: state.id,
      executionId,
      error: errorMessage(error)
    })
  }
}

const runBlock = async(target, state) => {
  if (state.status === 'running' || state.status === 'stopping') {
    await stopBlock(target, state)
    return
  }

  state.language = languageFromBlock(state.pre)
  const code = codeFromBlock(state.pre)
  if (!state.language) {
    state.result = {
      success: false,
      error: 'Choose a language for this fenced code block before running it.'
    }
    state.status = 'done'
    renderToolbar(state)
    renderOutput(state)
    return
  }

  const executionId = nextExecutionId()
  state.executionId = executionId
  state.status = 'running'
  state.result = null
  renderToolbar(state)
  renderOutput(state)
  const started = nowMs()
  logCode('info', 'run:dispatch', {
    blockId: state.id,
    executionId,
    language: state.language,
    codeBytes: byteLength(code)
  })

  try {
    const result = await invokePrograms(target, 'run', {
      id: state.language,
      command: code,
      executionId
    })
    if (state.executionId !== executionId) return
    state.result = result
    state.status = 'done'
    logCode(result?.success ? 'info' : 'warn', 'run:result', {
      blockId: state.id,
      executionId,
      durationMs: elapsedMs(started),
      success: result?.success,
      interrupted: result?.interrupted,
      timedOut: result?.timedOut,
      truncated: result?.truncated
    })
  } catch (error) {
    if (state.executionId !== executionId) return
    state.result = {
      success: false,
      language: state.language,
      outputLineLimit: runtimeSettings.outputLineLimit,
      error: errorMessage(error)
    }
    state.status = 'done'
    logCode('error', 'run:error', {
      blockId: state.id,
      executionId,
      durationMs: elapsedMs(started),
      error: errorMessage(error)
    })
  } finally {
    if (state.executionId === executionId) state.executionId = null
    renderToolbar(state)
    renderOutput(state)
    logCode('info', 'run:finished', {
      blockId: state.id,
      executionId,
      durationMs: elapsedMs(started)
    })
  }
}

const selectionOffsets = (root) => {
  const selection = globalThis.getSelection?.()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const startRange = range.cloneRange()
  startRange.selectNodeContents(root)
  startRange.setEnd(range.startContainer, range.startOffset)
  const endRange = range.cloneRange()
  endRange.selectNodeContents(root)
  endRange.setEnd(range.endContainer, range.endOffset)
  return { start: startRange.toString().length, end: endRange.toString().length }
}

const pointAtOffset = (root, requestedOffset) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = Math.max(0, requestedOffset)
  let node = walker.nextNode()
  while (node) {
    const length = node.nodeValue?.length || 0
    if (offset <= length) return { node, offset }
    offset -= length
    node = walker.nextNode()
  }
  return { node: root, offset: root.childNodes.length }
}

const setSelectionOffsets = (root, start, end = start) => {
  const selection = globalThis.getSelection?.()
  if (!selection) return false
  const startPoint = pointAtOffset(root, start)
  const endPoint = pointAtOffset(root, end)
  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

const replaceTextRange = (root, start, end, replacement) => {
  if (!setSelectionOffsets(root, start, end)) return false
  if (document.execCommand?.('insertText', false, replacement)) return true
  const selection = globalThis.getSelection?.()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range) return false
  range.deleteContents()
  const node = document.createTextNode(replacement)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: replacement
  }))
  return true
}

const installCodeEditing = (target, state) => {
  const code = state.pre.querySelector('code')
  if (!code || code.dataset.elephantCodeEditing === 'true') return
  code.dataset.elephantCodeEditing = 'true'
  code.spellcheck = false
  code.setAttribute('autocapitalize', 'off')
  code.setAttribute('autocomplete', 'off')
  code.setAttribute('autocorrect', 'off')

  code.addEventListener('keydown', (event) => {
    const current = blockStates.get(state.id) || state
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (current.status === 'running' || current.status === 'stopping') void stopBlock(target, current)
      else void runBlock(target, current)
      return
    }

    const offsets = selectionOffsets(code)
    if (!offsets) return
    const source = code.textContent || ''
    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const edit = indentationEdit(source, offsets.start, offsets.end, event.shiftKey)
      replaceTextRange(code, edit.replaceStart, edit.replaceEnd, edit.replacement)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const newline = indentationForNewline(source, offsets.start, languageFromBlock(current.pre))
      if (newline !== '\n') {
        event.preventDefault()
        event.stopPropagation()
        replaceTextRange(code, offsets.start, offsets.end, newline)
      }
    }
  })
}

const enhanceCodeBlock = (target, pre) => {
  if (!(pre instanceof HTMLElement)) return false
  if (!pre.querySelector('code')) return false
  if (pre.closest?.(`[${OUTPUT_ATTRIBUTE}]`)) return false

  const state = stateFor(pre)
  const toolbar = toolbarForState(target, state)
  state.toolbar = toolbar
  installCodeEditing(target, state)
  renderToolbar(state)
  renderOutput(state)

  if (blockObservers.has(pre)) return false
  let refreshScheduled = false
  let previousLanguage = state.language
  const refreshLanguage = (reason = 'initial') => {
    state.language = languageFromBlock(state.pre)
    state.fingerprint = fingerprintFor(state.pre)
    const languageElement = state.toolbar?.querySelector('.en-code-runner-language')
    const runButton = state.toolbar?.querySelector('.en-code-runner-run')
    applyLanguageUiState({
      languageElement,
      runButton,
      label: state.language || 'Code',
      disabled: !state.language,
      running: state.status === 'running' || state.status === 'stopping'
    })
    renderToolbar(state)
    if (state.language !== previousLanguage) {
      logCode('info', 'language:changed', {
        blockId: state.id,
        reason,
        previousLanguage,
        language: state.language,
        source: describeElement(findLanguageInput(state.pre))
      })
      previousLanguage = state.language
    }
  }
  const scheduleRefresh = (reason) => {
    if (refreshScheduled) return
    refreshScheduled = true
    queueMicrotask(() => {
      refreshScheduled = false
      refreshLanguage(reason)
    })
  }
  const observer = new MutationObserver((records) => {
    if (relevantLanguageMutations(records, toolbar).length > 0) scheduleRefresh('mutation')
  })
  observer.observe(pre, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'data-language', 'data-lang', 'data-value', 'lang', 'value']
  })
  const languageInput = findLanguageInput(pre)
  if (languageInput && !pre.contains(languageInput)) {
    observer.observe(languageInput, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-language', 'data-lang', 'data-value', 'lang', 'value']
    })
  }
  blockObservers.set(pre, observer)
  logCode('info', 'block:enhanced', {
    blockId: state.id,
    language: state.language,
    host: describeElement(state.host),
    pre: describeElement(pre),
    toolbarPlacement: state.host === pre ? 'sibling-fallback' : 'stable-code-host'
  })
  return true
}

const pruneDetachedStates = (target) => {
  const now = Date.now()
  for (const [blockId, state] of blockStates) {
    if (state.host?.isConnected || now - state.lastSeenAt <= DETACHED_STATE_GRACE_MS) continue
    if ((state.status === 'running' || state.status === 'stopping') && state.executionId) {
      void invokePrograms(target, 'stop', { executionId: state.executionId })
    }
    state.toolbar?.remove()
    state.output?.remove()
    blockStates.delete(blockId)
    logCode('debug', 'block:state-pruned', { blockId })
  }
}

const enhanceVisibleCodeBlocks = (target) => {
  let enhanced = 0
  editorBlocks().forEach((pre) => {
    if (enhanceCodeBlock(target, pre)) enhanced += 1
  })
  setTimeout(() => pruneDetachedStates(target), DETACHED_STATE_GRACE_MS + 50)
  if (enhanced > 0) logCode('info', 'scan:blocks-enhanced', { enhanced })
}

const configFromState = (state) => ({
  executionEnabled: state.executionEnabled === true,
  outputLineLimit: normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_OUTPUT_LINE_LIMIT),
  environments: Object.fromEntries(
    (state.environments || []).map((environment) => [
      environment.id,
      {
        enabled: environment.enabled !== false,
        executable: environment.configuredExecutable || ''
      }
    ])
  )
})

const saveSettings = async(target, state, reason) => {
  logCode('info', 'settings:save:start', {
    reason,
    executionEnabled: state.executionEnabled === true,
    outputLineLimit: state.outputLineLimit
  })
  const next = await invokePrograms(target, 'set', configFromState(state))
  Object.assign(state, next)
  updateRuntimeSettings(next)
  return state
}

const createSwitch = (checked, label, onChange) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `en-switch${checked ? ' active' : ''}`
  button.setAttribute('role', 'switch')
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-checked', checked ? 'true' : 'false')
  const knob = document.createElement('span')
  button.append(knob)
  button.addEventListener('click', onChange)
  return button
}

const createSettingsCopy = (label, description) => {
  const copy = document.createElement('div')
  const title = document.createElement('strong')
  const detail = document.createElement('span')
  copy.className = 'en-settings-row-copy'
  title.textContent = label
  detail.textContent = description
  copy.append(title, detail)
  return copy
}

const vueScopeAttributes = (source) =>
  [...(source?.attributes || [])]
    .map((attribute) => attribute.name)
    .filter((name) => name.startsWith('data-v-'))

const applyVueScope = (root, source) => {
  const attributes = vueScopeAttributes(source)
  if (attributes.length === 0) return
  const elements = [root, ...root.querySelectorAll('*')]
  for (const element of elements) {
    for (const attribute of attributes) element.setAttribute(attribute, '')
  }
}

const renderEnvironmentSettings = (target, host, state, scopeSource) => {
  host.replaceChildren()
  host.setAttribute(SETTINGS_ATTRIBUTE, 'true')
  host.className = 'en-settings-group en-code-settings-group'

  const enabledRow = document.createElement('div')
  enabledRow.className = 'en-settings-row'
  const globalSwitch = createSwitch(state.executionEnabled === true, 'Enable code execution', async() => {
    globalSwitch.disabled = true
    state.executionEnabled = !state.executionEnabled
    try {
      await saveSettings(target, state, 'global-toggle')
      renderEnvironmentSettings(target, host, state, scopeSource)
    } catch (error) {
      state.executionEnabled = !state.executionEnabled
      globalSwitch.disabled = false
      globalSwitch.title = errorMessage(error)
    }
  })
  enabledRow.append(
    createSettingsCopy(
      'Code execution',
      'Run fenced code blocks with local interpreters. Execution stays disabled until you explicitly enable it.'
    ),
    globalSwitch
  )
  host.append(enabledRow)

  const outputRow = document.createElement('div')
  const outputSelect = document.createElement('select')
  outputRow.className = 'en-settings-row'
  outputSelect.className = 'en-compact-select'
  outputSelect.setAttribute('aria-label', 'Maximum retained output lines')
  for (const lineLimit of [10, 20, 50, 100, 200, 500, 1000, 5000]) {
    const option = document.createElement('option')
    option.value = String(lineLimit)
    option.textContent = lineLimit === 5000 ? '5,000 lines' : `${lineLimit} lines`
    option.selected = Number(state.outputLineLimit) === lineLimit
    outputSelect.append(option)
  }
  outputSelect.addEventListener('change', async() => {
    const previous = state.outputLineLimit
    state.outputLineLimit = normalizeOutputLineLimit(outputSelect.value, DEFAULT_OUTPUT_LINE_LIMIT)
    outputSelect.disabled = true
    try {
      await saveSettings(target, state, 'output-line-limit')
      renderEnvironmentSettings(target, host, state, scopeSource)
    } catch (error) {
      state.outputLineLimit = previous
      outputSelect.disabled = false
      outputSelect.title = errorMessage(error)
    }
  })
  outputRow.append(
    createSettingsCopy(
      'Retained output',
      'Keep only the last lines from stdout and stderr. Long output remains scrollable inside the result panel.'
    ),
    outputSelect
  )
  host.append(outputRow)

  const warning = document.createElement('div')
  warning.className = 'en-code-settings-note'
  warning.textContent = 'Code runs with your normal user permissions. Only execute code you trust; this is not a container or sandbox.'
  host.append(warning)

  const heading = document.createElement('div')
  const headingTitle = document.createElement('strong')
  const headingMeta = document.createElement('span')
  heading.className = 'en-code-settings-subheading'
  headingTitle.textContent = 'Local environments'
  headingMeta.textContent = 'Detected on this device'
  heading.append(headingTitle, headingMeta)
  host.append(heading)

  for (const environment of state.environments || []) {
    const row = document.createElement('div')
    const controls = document.createElement('div')
    const status = document.createElement('span')
    const executable = document.createElement('input')
    const toggle = createSwitch(environment.enabled !== false, `Enable ${environment.label}`, async() => {
      toggle.disabled = true
      environment.enabled = !environment.enabled
      try {
        await saveSettings(target, state, `environment-toggle:${environment.id}`)
        renderEnvironmentSettings(target, host, state, scopeSource)
      } catch (error) {
        environment.enabled = !environment.enabled
        toggle.disabled = false
        toggle.title = errorMessage(error)
      }
    })
    row.className = 'en-settings-row en-code-environment-row'
    controls.className = 'en-code-environment-controls'
    status.className = `en-status-badge${environment.available ? ' active' : ''}`
    status.textContent = environment.available ? 'Available' : 'Not detected'
    executable.type = 'text'
    executable.className = 'en-compact-input en-code-executable-input'
    executable.value = environment.configuredExecutable || ''
    executable.placeholder = environment.executable || 'Executable path'
    executable.title = environment.executable || 'Executable name or absolute path'
    executable.setAttribute('aria-label', `${environment.label} executable`)
    executable.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') executable.blur()
    })
    executable.addEventListener('change', async() => {
      environment.configuredExecutable = executable.value.trim()
      executable.disabled = true
      try {
        await saveSettings(target, state, `executable:${environment.id}`)
        renderEnvironmentSettings(target, host, state, scopeSource)
      } catch (error) {
        executable.disabled = false
        executable.setCustomValidity(errorMessage(error))
        executable.reportValidity()
      }
    })
    const description = environment.available
      ? [environment.version, environment.configuredExecutable ? 'Custom executable' : 'Auto-detected']
          .filter(Boolean)
          .join(' · ')
      : 'Install the runtime or enter an executable path.'
    controls.append(status, executable, toggle)
    row.append(createSettingsCopy(environment.label, description), controls)
    host.append(row)
  }

  applyVueScope(host, scopeSource)
  logCode('info', 'settings:rendered', {
    executionEnabled: state.executionEnabled === true,
    outputLineLimit: state.outputLineLimit,
    environments: state.environments?.length || 0
  })
}

const installSettingsPanel = async(target, editorSettingsRoot) => {
  if (editorSettingsRoot.querySelector(`[${SETTINGS_ATTRIBUTE}]`)) return
  const marker =
    editorSettingsRoot
      .querySelector('button[aria-label="Show code block line numbers"]')
      ?.closest('.en-settings-row') ||
    [...editorSettingsRoot.querySelectorAll('.en-settings-row-copy strong')]
      .find((node) => node.textContent.trim() === 'Code block line numbers')
      ?.closest('.en-settings-row')
  if (!marker) return

  const host = document.createElement('section')
  host.className = 'en-settings-group en-code-settings-group'
  marker.closest('.en-settings-group')?.insertAdjacentElement('afterend', host)
  host.innerHTML = '<p class="en-code-settings-loading">Detecting local environments…</p>'
  applyVueScope(host, marker)
  try {
    const state = await invokePrograms(target, 'list')
    state.outputLineLimit = normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_OUTPUT_LINE_LIMIT)
    renderEnvironmentSettings(target, host, state, marker)
  } catch (error) {
    host.innerHTML = ''
    const message = document.createElement('p')
    message.className = 'en-code-settings-error'
    message.textContent = errorMessage(error)
    host.append(message)
    applyVueScope(host, marker)
  }
}

const enhanceSettings = (target) => {
  const content = document.querySelector('.en-settings-content')
  if (content) void installSettingsPanel(target, content)
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  if (target.__ELEPHANT_EXECUTABLE_CODE_BLOCKS_INSTALLED__) return
  target.__ELEPHANT_EXECUTABLE_CODE_BLOCKS_INSTALLED__ = true
  logCode('info', 'install:start', { readyState: document.readyState })
  installProgramsApi(target)

  let scanScheduled = false
  const scan = (reason) => {
    scanScheduled = false
    const started = nowMs()
    try {
      installProgramsApi(target)
      enhanceVisibleCodeBlocks(target)
      enhanceSettings(target)
      logCode('debug', 'scan:complete', { reason, durationMs: elapsedMs(started) })
    } catch (error) {
      logCode('error', 'scan:error', {
        reason,
        durationMs: elapsedMs(started),
        error: errorMessage(error)
      })
    }
  }
  const scheduleScan = (reason) => {
    if (scanScheduled) return
    scanScheduled = true
    const schedule = target.requestAnimationFrame || ((callback) => setTimeout(callback, 0))
    schedule(() => scan(reason))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleScan('dom-content-loaded'), { once: true })
  } else scheduleScan('install')

  const root = document.documentElement || document.body
  if (root) {
    const nodeNeedsScan = (node) => {
      if (node?.nodeType !== 1) return false
      if (node.matches?.(`[${TOOLBAR_ATTRIBUTE}], [${OUTPUT_ATTRIBUTE}], [${SETTINGS_ATTRIBUTE}]`)) return false
      return Boolean(node.matches?.('pre, .en-settings-content') || node.querySelector?.('pre, .en-settings-content'))
    }
    const observer = new MutationObserver((records) => {
      const needsScan = records.some((record) => {
        if ([...record.addedNodes].some(nodeNeedsScan)) return true
        return [...record.removedNodes].some((node) =>
          node?.nodeType === 1 && Boolean(
            node.matches?.(`[${TOOLBAR_ATTRIBUTE}], [${OUTPUT_ATTRIBUTE}], pre`) ||
            node.querySelector?.(`[${TOOLBAR_ATTRIBUTE}], [${OUTPUT_ATTRIBUTE}], pre`)
          )
        )
      })
      if (needsScan) scheduleScan('document-mutation')
    })
    observer.observe(root, { subtree: true, childList: true })
    target.addEventListener?.('beforeunload', () => observer.disconnect(), { once: true })
  }
  logCode('info', 'install:complete', {
    watchdogMs: RUN_WATCHDOG_MS,
    outputLineLimit: runtimeSettings.outputLineLimit
  })
}

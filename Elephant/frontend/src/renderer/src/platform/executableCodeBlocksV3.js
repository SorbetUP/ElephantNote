import './executableCodeBlocks.v2.css'
import './executableCodeBlocks.portal.css'
import { indentationEdit, indentationForNewline, normalizeOutputLineLimit } from './executableCodeEditing'

const ROOTS = '.en-editor-host, .muya-container, .ag-editor'
const SETTINGS = 'data-elephant-code-settings'
const DEFAULT_LINES = 200
const RUN_TIMEOUT = 22_000
const IPC_TIMEOUT = 10_000
const STATE_TTL = 30_000
const LANG_INPUT = [
  '.ag-language-input', '.language-input', '.ag-code-language', '.code-block-language',
  '[data-function-type="languageInput"]', '[functiontype="languageInput"]',
  '[data-role="language-input"]', '[data-language-input]',
  '[data-placeholder*="language" i]', '[placeholder*="language" i]', '[aria-label*="language" i]'
].join(', ')

let sequence = 0
let rootSequence = 0
let settings = { outputLineLimit: DEFAULT_LINES }
const states = new Map()
const byPre = new WeakMap()
const rootIds = new WeakMap()
const editingInstalled = new WeakSet()

const frame = (callback) => (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(callback)
const now = () => globalThis.performance?.now?.() || Date.now()
const elapsed = (started) => Math.max(0, Math.round(now() - started))
const message = (error) => error?.message || String(error || 'Unknown error')
const bytes = (value = '') => {
  try { return new TextEncoder().encode(String(value)).byteLength } catch { return String(value).length }
}
const log = (level, event, details = {}) => (console[level] || console.log)(`[Code:UI] ${event}`, details)
const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const watchdog = (promise, timeoutMs, label, onTimeout) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(new Error(label))
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const invokePrograms = async(target, action, payload = {}) => {
  const invoke = target?.__TAURI__?.core?.invoke
  const started = now()
  const requestId = `${action}-${Date.now().toString(36)}-${++sequence}`
  const timeoutMs = action === 'run' ? RUN_TIMEOUT : IPC_TIMEOUT
  const language = String(payload.id || '')
  const command = String(payload.command ?? payload.code ?? '')
  log('info', 'invoke:start', {
    requestId, action, language, executionId: payload.executionId || null,
    commandBytes: action === 'run' ? bytes(command) : 0, timeoutMs
  })
  if (typeof invoke !== 'function') throw new Error('The Tauri command API is unavailable for code execution.')
  let call
  if (action === 'list') call = invoke('tauri_programs_list')
  else if (action === 'set') call = invoke('tauri_programs_set', { environments: payload })
  else call = invoke('tauri_programs_run', action === 'stop'
    ? { id: '', command: '', cwd: null, executionId: payload.executionId, stop: true }
    : { id: language, command, cwd: payload.cwd || null, executionId: payload.executionId, stop: false })
  try {
    const result = await watchdog(
      Promise.resolve(call), timeoutMs,
      `Code execution IPC did not answer within ${timeoutMs} ms. Check the [Code] backend logs.`,
      () => log('error', 'invoke:watchdog-timeout', { requestId, action, timeoutMs })
    )
    if (result?.outputLineLimit !== undefined) {
      settings.outputLineLimit = normalizeOutputLineLimit(result.outputLineLimit, settings.outputLineLimit)
    }
    log('info', 'invoke:complete', {
      requestId, action, language, executionId: payload.executionId || result?.executionId || null,
      durationMs: elapsed(started), success: result?.success, stopped: result?.stopped,
      interrupted: result?.interrupted, exitCode: result?.exitCode, timedOut: result?.timedOut,
      truncated: result?.truncated, stdoutBytes: bytes(result?.stdout), stderrBytes: bytes(result?.stderr)
    })
    return result
  } catch (error) {
    log('error', 'invoke:error', { requestId, action, language, durationMs: elapsed(started), error: message(error) })
    throw error
  }
}

const installApi = (target) => {
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
    if (action === 'programs.set') return { ok: true, data: await invokePrograms(target, 'set', payload.environments || payload) }
    if (action === 'programs.run') return { ok: true, data: await invokePrograms(target, 'run', payload) }
    if (action === 'programs.stop') return { ok: true, data: await invokePrograms(target, 'stop', payload) }
    return original(action, payload)
  }
  patched.__elephantProgramsPatched = true
  api.call = patched
}

const normalizeLanguage = (value = '') => String(value).trim().toLowerCase()
  .replace(/^language-/, '').replace(/^lang-/, '')
const classLanguage = (node) => {
  for (const name of node?.classList || []) {
    if (name.startsWith('language-')) return normalizeLanguage(name.slice(9))
    if (name.startsWith('lang-')) return normalizeLanguage(name.slice(5))
  }
  return ''
}
const languageInput = (pre) => {
  for (const root of [pre, pre?.parentElement, pre?.previousElementSibling, pre?.parentElement?.previousElementSibling]) {
    if (!root) continue
    if (root.matches?.(LANG_INPUT)) return root
    const found = root.querySelector?.(LANG_INPUT)
    if (found) return found
  }
  return null
}
const languageOf = (pre) => {
  const code = pre?.querySelector('code')
  const direct = pre?.dataset?.language || pre?.dataset?.lang || pre?.getAttribute?.('lang') ||
    code?.dataset?.language || code?.dataset?.lang || code?.getAttribute?.('lang') ||
    classLanguage(pre) || classLanguage(code)
  const input = languageInput(pre)
  return normalizeLanguage(direct || input?.value || input?.dataset?.value || input?.textContent || '')
}
const codeOf = (pre) => {
  const code = pre?.querySelector('code')
  return String(code?.innerText ?? code?.textContent ?? pre?.innerText ?? pre?.textContent ?? '').replace(/\u00a0/g, ' ')
}
const fingerprint = (pre) => `${languageOf(pre)}\u0000${codeOf(pre)}`

const outerEditorRoots = () => [...document.querySelectorAll(ROOTS)].filter((root, index, all) =>
  !all.some((candidate, candidateIndex) => candidateIndex !== index && candidate.contains(root)))
const rootId = (root) => {
  if (!rootIds.has(root)) rootIds.set(root, `editor-${++rootSequence}`)
  return rootIds.get(root)
}
const stateFor = (root, pre, ordinal) => {
  if (byPre.has(pre)) return byPre.get(pre)
  const id = rootId(root)
  const mark = fingerprint(pre)
  const candidates = [...states.values()].filter((state) => !state.claimed && state.rootId === id && !state.pre?.isConnected)
  const state = candidates.find((item) => item.fingerprint === mark) ||
    candidates.find((item) => item.ordinal === ordinal) || {
      id: `block-${++sequence}`, root, rootId: id, ordinal, fingerprint: mark, pre: null,
      toolbar: null, output: null, status: 'idle', result: null, executionId: null,
      language: '', lastSeenAt: Date.now(), claimed: false
    }
  states.set(state.id, state)
  byPre.set(pre, state)
  return state
}

let layoutPending = false
const reserve = (state) => {
  if (!state.pre) return
  if (!state.output || state.output.hidden) {
    state.pre.classList.remove('en-code-runtime-has-output')
    state.pre.style.removeProperty('--en-code-runtime-output-height')
    return
  }
  const height = Math.ceil(state.output.getBoundingClientRect().height)
  if (height > 0) {
    state.pre.classList.add('en-code-runtime-has-output')
    state.pre.style.setProperty('--en-code-runtime-output-height', `${height}px`)
  }
}
const layout = () => {
  layoutPending = false
  for (const state of states.values()) {
    const connected = Boolean(state.pre?.isConnected)
    if (state.toolbar) state.toolbar.hidden = !connected
    if (state.output) state.output.hidden = !connected || (state.status === 'idle' && !state.result)
    if (!connected) continue
    const rect = state.pre.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
    if (state.toolbar) {
      state.toolbar.hidden = !visible
      if (visible) {
        state.toolbar.style.left = `${Math.max(8, rect.right - (state.toolbar.offsetWidth || 90) - 42)}px`
        state.toolbar.style.top = `${Math.max(8, rect.top + 8)}px`
      }
    }
    if (state.output && !state.output.hidden) {
      state.output.style.left = `${Math.max(8, rect.left)}px`
      state.output.style.top = `${Math.max(8, rect.bottom + 8)}px`
      state.output.style.width = `${Math.max(220, rect.width)}px`
    }
    reserve(state)
  }
}
const scheduleLayout = () => {
  if (layoutPending) return
  layoutPending = true
  frame(layout)
}

const copyText = async(text) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const input = make('textarea')
  input.value = text
  input.style.cssText = 'position:fixed;opacity:0'
  document.body.append(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

const renderToolbar = (target, layer, state) => {
  if (!state.toolbar) {
    const toolbar = make('div', 'en-code-runner-toolbar en-code-runtime-toolbar')
    const language = make('span', 'en-code-runner-language')
    const button = make('button', 'en-code-runner-run')
    const icon = make('span', 'en-code-runner-run-icon')
    toolbar.contentEditable = 'false'
    button.type = 'button'
    button.append(icon)
    toolbar.append(language, button)
    toolbar.addEventListener('pointerdown', (event) => log('info', 'run-button:pointerdown', {
      blockId: state.id, status: state.status, target: event.target?.className || event.target?.tagName || ''
    }))
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      log('info', 'run-button:click', { blockId: state.id, status: state.status, language: languageOf(state.pre) })
      void (state.status === 'running' || state.status === 'stopping' ? stop(target, state) : run(target, state))
    })
    layer.append(toolbar)
    state.toolbar = toolbar
  }
  state.language = languageOf(state.pre)
  const running = state.status === 'running' || state.status === 'stopping'
  const button = state.toolbar.querySelector('button')
  state.toolbar.querySelector('.en-code-runner-language').textContent = state.language || 'Code'
  button.disabled = !state.language && !running
  button.classList.toggle('is-running', running)
  button.classList.toggle('is-stopping', state.status === 'stopping')
  button.setAttribute('aria-label', running ? 'Stop code execution' : 'Run code block')
  button.title = running ? (state.status === 'stopping' ? 'Stopping…' : 'Stop execution') : 'Run code block · Cmd/Ctrl+Enter'
  button.querySelector('.en-code-runner-run-icon').textContent = running ? '' : '▶'
  scheduleLayout()
}

const renderOutput = (target, layer, state) => {
  if (state.status === 'idle' && !state.result) {
    state.output?.remove()
    state.output = null
    reserve(state)
    return scheduleLayout()
  }
  if (!state.output) {
    state.output = make('section', 'en-code-output en-code-runtime-output')
    state.output.contentEditable = 'false'
    layer.append(state.output)
  }
  const output = state.output
  const result = state.result || {}
  const running = state.status === 'running' || state.status === 'stopping'
  const limit = normalizeOutputLineLimit(result.outputLineLimit, settings.outputLineLimit)
  output.hidden = false
  output.classList.toggle('is-running', running)
  output.classList.toggle('is-error', !running && result.success !== true && !result.interrupted)
  output.classList.toggle('is-interrupted', result.interrupted === true)
  output.replaceChildren()

  const header = make('header')
  const identity = make('div', 'en-code-output-identity')
  const dot = make('span', 'en-code-output-status')
  const labels = make('div', 'en-code-output-copy')
  const title = make('strong', '', running ? (state.status === 'stopping' ? 'Stopping' : 'Running')
    : result.interrupted ? 'Stopped' : result.success ? 'Output' : 'Execution failed')
  const meta = make('span', '', running ? `${state.language || 'Code'} · local runtime` : [
    result.environment || result.language || state.language,
    Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
    result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
    result.interrupted ? 'interrupted' : '', result.timedOut ? 'timed out' : '',
    result.truncated ? `last ${limit} lines` : ''
  ].filter(Boolean).join(' · '))
  const actions = make('div', 'en-code-output-actions')
  const copy = make('button', '', 'Copy')
  const collapse = make('button', '', 'Collapse')
  const clear = make('button', '', 'Clear')
  for (const button of [copy, collapse, clear]) button.type = 'button'
  copy.disabled = running || (!result.stdout && !result.stderr && !result.error)
  collapse.disabled = clear.disabled = running
  copy.addEventListener('click', async() => {
    try {
      await copyText([result.stdout, result.stderr || result.error].filter(Boolean).join('\n'))
      copy.textContent = 'Copied'
      setTimeout(() => { copy.textContent = 'Copy' }, 1200)
    } catch (error) { copy.textContent = 'Copy failed' }
  })
  clear.addEventListener('click', () => {
    state.status = 'idle'
    state.result = null
    renderToolbar(target, layer, state)
    renderOutput(target, layer, state)
    log('info', 'output:cleared', { blockId: state.id })
  })
  labels.append(title, meta)
  identity.append(dot, labels)
  actions.append(copy, collapse, clear)
  header.append(identity, actions)
  output.append(header)
  const body = make('div', 'en-code-output-body')
  output.append(body)
  collapse.addEventListener('click', () => {
    body.hidden = !body.hidden
    collapse.textContent = body.hidden ? 'Expand' : 'Collapse'
    output.classList.toggle('is-collapsed', body.hidden)
    scheduleLayout()
  })
  if (running) body.append(make('div', 'en-code-output-progress'))
  else {
    if (result.truncated) body.append(make('p', 'en-code-output-notice',
      `Earlier output was discarded. Showing the last ${limit} lines from a bounded buffer.`))
    const stream = (label, value, className, lineCount) => {
      if (!value) return
      const section = make('section', `en-code-output-stream ${className}`)
      const streamHeader = make('div', 'en-code-output-stream-header')
      streamHeader.append(make('strong', '', label), make('span', '', Number.isFinite(Number(lineCount))
        ? `${lineCount} line${Number(lineCount) === 1 ? '' : 's'}` : ''))
      section.append(streamHeader, make('pre', '', value))
      body.append(section)
    }
    stream('stdout', result.stdout, 'en-code-output-stdout', result.stdoutLines)
    stream('stderr', result.stderr || result.error, 'en-code-output-stderr', result.stderrLines)
    if (!result.stdout && !result.stderr && !result.error) body.append(make('p', 'en-code-output-empty',
      result.interrupted ? 'The program was stopped before it produced output.' : 'The program completed without producing output.'))
  }
  scheduleLayout()
}

const stop = async(target, state) => {
  if (!state.executionId || state.status === 'stopping') return
  const executionId = state.executionId
  const layer = target.__ELEPHANT_CODE_RUNTIME__.layer
  state.status = 'stopping'
  renderToolbar(target, layer, state)
  renderOutput(target, layer, state)
  log('info', 'stop:dispatch', { blockId: state.id, executionId })
  try {
    const result = await invokePrograms(target, 'stop', { executionId })
    log(result?.stopped ? 'info' : 'warn', 'stop:result', { blockId: state.id, executionId, stopped: result?.stopped === true })
    if (!result?.stopped && state.executionId === executionId) state.status = 'running'
  } catch (error) {
    if (state.executionId === executionId) state.status = 'running'
    log('error', 'stop:error', { blockId: state.id, executionId, error: message(error) })
  }
  renderToolbar(target, layer, state)
  renderOutput(target, layer, state)
}

const run = async(target, state) => {
  if (state.status === 'running' || state.status === 'stopping') return stop(target, state)
  const layer = target.__ELEPHANT_CODE_RUNTIME__.layer
  state.language = languageOf(state.pre)
  const code = codeOf(state.pre)
  if (!state.language) {
    state.status = 'done'
    state.result = { success: false, error: 'Choose a language for this fenced code block before running it.' }
    renderToolbar(target, layer, state)
    return renderOutput(target, layer, state)
  }
  const executionId = `execution-${Date.now().toString(36)}-${++sequence}`
  const started = now()
  state.executionId = executionId
  state.status = 'running'
  state.result = null
  renderToolbar(target, layer, state)
  renderOutput(target, layer, state)
  log('info', 'run:dispatch', { blockId: state.id, executionId, language: state.language, codeBytes: bytes(code) })
  try {
    const result = await invokePrograms(target, 'run', { id: state.language, command: code, executionId })
    if (state.executionId !== executionId) return
    state.result = result
    state.status = 'done'
    log(result?.success ? 'info' : 'warn', 'run:result', {
      blockId: state.id, executionId, durationMs: elapsed(started), success: result?.success,
      interrupted: result?.interrupted, timedOut: result?.timedOut, truncated: result?.truncated
    })
  } catch (error) {
    if (state.executionId !== executionId) return
    state.status = 'done'
    state.result = { success: false, language: state.language, outputLineLimit: settings.outputLineLimit, error: message(error) }
    log('error', 'run:error', { blockId: state.id, executionId, durationMs: elapsed(started), error: message(error) })
  } finally {
    if (state.executionId === executionId) state.executionId = null
    renderToolbar(target, layer, state)
    renderOutput(target, layer, state)
    log('info', 'run:finished', { blockId: state.id, executionId, durationMs: elapsed(started) })
  }
}

const selectionOffsets = (root) => {
  const selection = getSelection?.()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const offset = (container, position) => {
    const copy = range.cloneRange()
    copy.selectNodeContents(root)
    copy.setEnd(container, position)
    return copy.toString().length
  }
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) }
}
const point = (root, requested) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, requested)
  let node
  while ((node = walker.nextNode())) {
    if (remaining <= (node.nodeValue?.length || 0)) return { node, offset: remaining }
    remaining -= node.nodeValue?.length || 0
  }
  return { node: root, offset: root.childNodes.length }
}
const replaceRange = (root, start, end, replacement) => {
  const selection = getSelection?.()
  if (!selection) return
  const from = point(root, start)
  const to = point(root, end)
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  if (document.execCommand?.('insertText', false, replacement)) return
  range.deleteContents()
  const text = document.createTextNode(replacement)
  range.insertNode(text)
  root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement }))
}
const installEditing = (target, state) => {
  const code = state.pre?.querySelector('code')
  if (!code || editingInstalled.has(code)) return
  editingInstalled.add(code)
  code.spellcheck = false
  code.setAttribute('autocapitalize', 'off')
  code.setAttribute('autocomplete', 'off')
  code.setAttribute('autocorrect', 'off')
  code.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      return void (state.status === 'running' || state.status === 'stopping' ? stop(target, state) : run(target, state))
    }
    const offsets = selectionOffsets(code)
    if (!offsets) return
    const source = code.textContent || ''
    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const edit = indentationEdit(source, offsets.start, offsets.end, event.shiftKey)
      replaceRange(code, edit.replaceStart, edit.replaceEnd, edit.replacement)
    } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const newline = indentationForNewline(source, offsets.start, languageOf(state.pre))
      if (newline !== '\n') {
        event.preventDefault()
        event.stopPropagation()
        replaceRange(code, offsets.start, offsets.end, newline)
      }
    }
  })
}

const reconcile = (target, layer) => {
  for (const state of states.values()) state.claimed = false
  let enhanced = 0
  for (const root of outerEditorRoots()) {
    [...root.querySelectorAll('pre')].filter((pre) => pre.querySelector('code')).forEach((pre, ordinal) => {
      const state = stateFor(root, pre, ordinal)
      const replaced = state.pre !== pre
      Object.assign(state, {
        root, rootId: rootId(root), ordinal, pre, fingerprint: fingerprint(pre),
        language: languageOf(pre), lastSeenAt: Date.now(), claimed: true
      })
      byPre.set(pre, state)
      installEditing(target, state)
      renderToolbar(target, layer, state)
      renderOutput(target, layer, state)
      if (replaced) {
        enhanced += 1
        log('info', 'block:enhanced', {
          blockId: state.id, language: state.language, ordinal,
          portal: true, editorMarkupUntouched: true
        })
      }
    })
  }
  const time = Date.now()
  for (const [id, state] of states) {
    if (state.claimed || (state.root?.isConnected && time - state.lastSeenAt <= STATE_TTL)) continue
    if (state.executionId) void invokePrograms(target, 'stop', { executionId: state.executionId })
    state.toolbar?.remove()
    state.output?.remove()
    states.delete(id)
    log('debug', 'block:state-pruned', { blockId: id })
  }
  if (enhanced) log('info', 'scan:blocks-enhanced', { enhanced })
  scheduleLayout()
}

const config = (state) => ({
  executionEnabled: state.executionEnabled === true,
  outputLineLimit: normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_LINES),
  environments: Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
    enabled: environment.enabled !== false,
    executable: environment.configuredExecutable || ''
  }]))
})
const saveSettings = async(target, state) => Object.assign(state, await invokePrograms(target, 'set', config(state)))
const rowCopy = (title, detail) => {
  const copy = make('div', 'en-settings-row-copy')
  copy.append(make('strong', '', title), make('span', '', detail))
  return copy
}
const toggle = (checked, label, handler) => {
  const button = make('button', `en-switch${checked ? ' active' : ''}`)
  button.type = 'button'
  button.setAttribute('role', 'switch')
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-checked', checked ? 'true' : 'false')
  button.append(make('span'))
  button.addEventListener('click', handler)
  return button
}
const renderSettings = (target, host, state) => {
  host.replaceChildren(make('div', 'en-code-settings-title', 'Code execution'))
  const enabled = make('div', 'en-settings-row')
  const enabledToggle = toggle(state.executionEnabled, 'Enable code execution', async() => {
    state.executionEnabled = !state.executionEnabled
    try { await saveSettings(target, state); renderSettings(target, host, state) } catch (error) { enabledToggle.title = message(error) }
  })
  enabled.append(rowCopy('Code execution', 'Run trusted fenced blocks with local interpreters.'), enabledToggle)
  host.append(enabled)
  const output = make('div', 'en-settings-row')
  const select = make('select', 'en-compact-select')
  for (const value of [10, 20, 50, 100, 200, 500, 1000, 5000]) {
    const option = make('option', '', value === 5000 ? '5,000 lines' : `${value} lines`)
    option.value = String(value)
    option.selected = Number(state.outputLineLimit) === value
    select.append(option)
  }
  select.addEventListener('change', async() => {
    state.outputLineLimit = normalizeOutputLineLimit(select.value, DEFAULT_LINES)
    try { await saveSettings(target, state); renderSettings(target, host, state) } catch (error) { select.title = message(error) }
  })
  output.append(rowCopy('Retained output', 'Keep only the final stdout and stderr lines.'), select)
  host.append(output, make('div', 'en-code-settings-note', 'Code runs with your normal user permissions. It is not sandboxed.'))
  for (const environment of state.environments || []) {
    const row = make('div', 'en-settings-row en-code-environment-row')
    const controls = make('div', 'en-code-environment-controls')
    const status = make('span', `en-status-badge${environment.available ? ' active' : ''}`, environment.available ? 'Available' : 'Not detected')
    const executable = make('input', 'en-compact-input en-code-executable-input')
    executable.value = environment.configuredExecutable || ''
    executable.placeholder = environment.executable || 'Executable path'
    executable.addEventListener('change', async() => {
      environment.configuredExecutable = executable.value.trim()
      try { await saveSettings(target, state); renderSettings(target, host, state) } catch (error) { executable.title = message(error) }
    })
    const environmentToggle = toggle(environment.enabled !== false, `Enable ${environment.label}`, async() => {
      environment.enabled = !environment.enabled
      try { await saveSettings(target, state); renderSettings(target, host, state) } catch (error) { environmentToggle.title = message(error) }
    })
    controls.append(status, executable, environmentToggle)
    row.append(rowCopy(environment.label, environment.available
      ? [environment.version, environment.configuredExecutable ? 'Custom executable' : 'Auto-detected'].filter(Boolean).join(' · ')
      : 'Install the runtime or enter an executable path.'), controls)
    host.append(row)
  }
}
const installSettings = async(target) => {
  const content = document.querySelector('.en-settings-content')
  if (!content || content.querySelector(`[${SETTINGS}]`)) return
  const marker = content.querySelector('.en-settings-group')
  if (!marker) return
  const host = make('section', 'en-settings-group en-code-settings-group')
  host.setAttribute(SETTINGS, 'true')
  marker.insertAdjacentElement('afterend', host)
  host.append(make('p', 'en-code-settings-loading', 'Detecting local environments…'))
  try {
    const state = await invokePrograms(target, 'list')
    state.outputLineLimit = normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_LINES)
    renderSettings(target, host, state)
  } catch (error) { host.replaceChildren(make('p', 'en-code-settings-error', message(error))) }
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  if (target.__ELEPHANT_CODE_RUNTIME__) return target.__ELEPHANT_CODE_RUNTIME__
  installApi(target)
  const layer = make('div', 'en-code-runtime-layer')
  document.body.append(layer)
  let scanPending = false
  const scan = (reason = 'manual') => {
    scanPending = false
    const started = now()
    try {
      installApi(target)
      reconcile(target, layer)
      void installSettings(target)
      log('debug', 'scan:complete', { reason, durationMs: elapsed(started) })
    } catch (error) { log('error', 'scan:error', { reason, error: message(error) }) }
  }
  const scheduleScan = (reason) => {
    if (scanPending) return
    scanPending = true
    frame(() => scan(reason))
  }
  const observer = new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) =>
      node?.nodeType === 1 && !layer.contains(node) && (node.matches?.(`pre, ${ROOTS}, .en-settings-content`) || node.querySelector?.(`pre, ${ROOTS}, .en-settings-content`))))) {
      scheduleScan('document-mutation')
    }
  })
  observer.observe(document.documentElement || document.body, { subtree: true, childList: true })
  const viewport = () => scheduleLayout()
  document.addEventListener('scroll', viewport, true)
  target.addEventListener?.('resize', viewport)
  const runtime = {
    layer, states, scan, scheduleScan,
    dispose: () => {
      observer.disconnect()
      document.removeEventListener('scroll', viewport, true)
      target.removeEventListener?.('resize', viewport)
      for (const state of states.values()) {
        state.toolbar?.remove()
        state.output?.remove()
        state.pre?.classList.remove('en-code-runtime-has-output')
        state.pre?.style.removeProperty('--en-code-runtime-output-height')
      }
      states.clear()
      layer.remove()
      delete target.__ELEPHANT_CODE_RUNTIME__
    }
  }
  target.__ELEPHANT_CODE_RUNTIME__ = runtime
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleScan('dom-content-loaded'), { once: true })
  else scheduleScan('install')
  log('info', 'install:complete', { runtime: 'v3-portal', watchdogMs: RUN_TIMEOUT, outputLineLimit: settings.outputLineLimit })
  return runtime
}

export const resetExecutableCodeBlocksForTests = (target = globalThis) => {
  target.__ELEPHANT_CODE_RUNTIME__?.dispose?.()
  sequence = 0
  rootSequence = 0
  settings = { outputLineLimit: DEFAULT_LINES }
}

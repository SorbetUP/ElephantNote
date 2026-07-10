import './executableCodeBlocks.v2.css'
import './executableCodeBlocksV4.css'
import { indentationEdit, indentationForNewline, normalizeOutputLineLimit } from './executableCodeEditing'

const ROOTS = '.en-editor-host, .muya-container, .ag-editor'
const HOSTS = '[data-code-block], [data-role="code-block"], [data-type="code-block"], .ag-code-block, .code-block'
const SETTINGS_HOST = '.en-settings-content'
const SETTINGS_MARKER = 'data-elephant-code-settings-v4'
const LANGUAGE_INPUT = [
  '.ag-language-input', '.language-input', '.ag-code-language', '.code-block-language',
  '[data-function-type="languageInput"]', '[functiontype="languageInput"]',
  '[data-role="language-input"]', '[data-language-input]',
  '[data-placeholder*="language" i]', '[placeholder*="language" i]', '[aria-label*="language" i]'
].join(', ')
const DEFAULT_LINES = 200
const RUN_TIMEOUT = 22_000
const IPC_TIMEOUT = 10_000
const DETACHED_TTL = 2_000
const SCAN_DEBOUNCE_MS = 60

let sequence = 0

const now = () => globalThis.performance?.now?.() || Date.now()
const elapsed = (started) => Math.max(0, Math.round(now() - started))
const errorMessage = (error) => error?.message || String(error || 'Unknown error')
const byteLength = (value = '') => {
  try { return new TextEncoder().encode(String(value)).byteLength } catch { return String(value).length }
}
const log = (level, event, details = {}) => (console[level] || console.log)(`[Code:UI] ${event}`, details)
const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const normalizeLanguage = (value = '') => String(value).trim().toLowerCase()
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
  if (typeof invoke !== 'function') throw new Error('The Tauri command API is unavailable for code execution.')
  const started = now()
  const requestId = `${action}-${Date.now().toString(36)}-${++sequence}`
  const timeoutMs = action === 'run' ? RUN_TIMEOUT : IPC_TIMEOUT
  const language = String(payload.id || '')
  const command = String(payload.command ?? payload.code ?? '')
  log('info', 'invoke:start', {
    requestId,
    action,
    language,
    executionId: payload.executionId || null,
    commandBytes: action === 'run' ? byteLength(command) : 0,
    timeoutMs
  })
  let call
  if (action === 'list') call = invoke('tauri_programs_list')
  else if (action === 'set') call = invoke('tauri_programs_set', { environments: payload })
  else call = invoke('tauri_programs_run', action === 'stop'
    ? { id: '', command: '', cwd: null, executionId: payload.executionId, stop: true }
    : { id: language, command, cwd: payload.cwd || null, executionId: payload.executionId, stop: false })
  try {
    const result = await withTimeout(
      Promise.resolve(call),
      timeoutMs,
      `Code execution IPC did not answer within ${timeoutMs} ms.`
    )
    log('info', 'invoke:complete', {
      requestId,
      action,
      language,
      executionId: payload.executionId || result?.executionId || null,
      durationMs: elapsed(started),
      success: result?.success,
      stopped: result?.stopped,
      interrupted: result?.interrupted,
      exitCode: result?.exitCode,
      timedOut: result?.timedOut,
      truncated: result?.truncated,
      stdoutBytes: byteLength(result?.stdout),
      stderrBytes: byteLength(result?.stderr)
    })
    return result
  } catch (error) {
    log('error', 'invoke:error', {
      requestId,
      action,
      language,
      durationMs: elapsed(started),
      error: errorMessage(error)
    })
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

const classLanguage = (node) => {
  for (const className of node?.classList || []) {
    if (className.startsWith('language-')) return normalizeLanguage(className.slice(9))
    if (className.startsWith('lang-')) return normalizeLanguage(className.slice(5))
  }
  return ''
}
const findLanguageInput = (pre) => {
  const host = pre?.closest?.(HOSTS) || pre?.parentElement
  for (const root of [host, pre?.parentElement, pre?.previousElementSibling, host?.previousElementSibling]) {
    if (!root) continue
    if (root.matches?.(LANGUAGE_INPUT)) return root
    const input = root.querySelector?.(LANGUAGE_INPUT)
    if (input) return input
  }
  return null
}
const languageOf = (pre) => {
  const code = pre?.querySelector?.('code')
  const explicit = pre?.dataset?.language || pre?.dataset?.lang || pre?.getAttribute?.('lang') ||
    code?.dataset?.language || code?.dataset?.lang || code?.getAttribute?.('lang') ||
    classLanguage(pre) || classLanguage(code)
  const input = findLanguageInput(pre)
  return normalizeLanguage(explicit || input?.value || input?.dataset?.value || input?.textContent || '')
}
const codeOf = (pre) => {
  const code = pre?.querySelector?.('code')
  return String(code?.innerText ?? code?.textContent ?? pre?.innerText ?? pre?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
}
const fingerprint = (pre) => `${languageOf(pre)}\u0000${codeOf(pre)}`

const visibleText = (element) => normalizeLanguage(
  element?.value || element?.dataset?.value || element?.textContent || ''
)
const nearbyElements = (host, pre) => {
  const elements = new Set()
  for (const root of [host, pre?.parentElement, pre?.previousElementSibling, host?.previousElementSibling]) {
    if (!root) continue
    if (root.nodeType === 1) elements.add(root)
    for (const element of root.querySelectorAll?.('*') || []) elements.add(element)
  }
  return [...elements].filter((element) => !pre?.contains?.(element))
}
const findNativeChrome = (pre, language) => {
  const host = pre?.closest?.(HOSTS) || pre?.parentElement || pre
  const candidates = nearbyElements(host, pre)
  const languageControl = candidates.find((element) => element.matches?.(LANGUAGE_INPUT)) ||
    candidates.find((element) => {
      if (!language || element.matches?.('button, svg, path, pre, code')) return false
      if (element.children.length > 1) return false
      return visibleText(element) === language
    }) || null
  const copyControl = candidates.find((element) => {
    const className = String(element.className || '').toLowerCase()
    const label = `${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`.toLowerCase()
    if (!element.matches?.('button, [role="button"], [tabindex]') && !className.includes('copy')) return false
    return className.includes('copy') || label.includes('copy')
  }) || null
  const fenceHint = candidates.find((element) => {
    if (element === languageControl || element.matches?.('button, pre, code')) return false
    const className = String(element.className || '').toLowerCase()
    const text = visibleText(element)
    return text === 'code fence' || (className.includes('fence') && text.includes('fence'))
  }) || null
  return { host, languageControl, copyControl, fenceHint }
}
const clearNativeChrome = (state) => {
  state.chrome?.host?.classList?.remove('en-code-v4-host')
  state.chrome?.languageControl?.classList?.remove('en-code-v4-language')
  state.chrome?.copyControl?.classList?.remove('en-code-v4-native-copy')
  state.chrome?.fenceHint?.classList?.remove('en-code-v4-fence-hint')
}
const enhanceNativeChrome = (state) => {
  const chrome = findNativeChrome(state.pre, state.language)
  if (state.chrome?.host !== chrome.host ||
      state.chrome?.languageControl !== chrome.languageControl ||
      state.chrome?.copyControl !== chrome.copyControl ||
      state.chrome?.fenceHint !== chrome.fenceHint) clearNativeChrome(state)
  chrome.host?.classList?.add('en-code-v4-host')
  chrome.languageControl?.classList?.add('en-code-v4-language')
  chrome.copyControl?.classList?.add('en-code-v4-native-copy')
  chrome.fenceHint?.classList?.add('en-code-v4-fence-hint')
  state.pre?.classList?.add('en-code-v4-pre')
  state.chrome = chrome
}

const copyText = async(target, text) => {
  if (target.navigator?.clipboard?.writeText) return target.navigator.clipboard.writeText(text)
  const textarea = make('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand?.('copy')
  textarea.remove()
}

const selectionOffsets = (root) => {
  const selection = globalThis.getSelection?.()
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
const pointAt = (root, requested) => {
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
  const selection = globalThis.getSelection?.()
  if (!selection) return
  const from = pointAt(root, start)
  const to = pointAt(root, end)
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  if (document.execCommand?.('insertText', false, replacement)) return
  range.deleteContents()
  const text = document.createTextNode(replacement)
  range.insertNode(text)
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

const createRuntime = (target) => {
  const layer = make('div', 'en-code-v4-layer')
  document.body.append(layer)
  const states = new Map()
  const byPre = new WeakMap()
  const rootIds = new WeakMap()
  const editingInstalled = new WeakSet()
  let rootSequence = 0
  let scanTimer = null
  let layoutPending = false
  let disposed = false
  let resizeObserver = null
  const metrics = {
    scans: 0,
    scheduledScans: 0,
    coalescedScans: 0,
    ignoredMutations: 0,
    topologyChanges: 0
  }

  const outerRoots = () => [...document.querySelectorAll(ROOTS)].filter((root, index, all) =>
    !all.some((candidate, candidateIndex) => candidateIndex !== index && candidate.contains(root)))
  const rootId = (root) => {
    if (!rootIds.has(root)) rootIds.set(root, `editor-${++rootSequence}`)
    return rootIds.get(root)
  }
  const reserveOutput = (state) => {
    if (!state.pre) return
    if (!state.output || state.output.hidden) {
      state.pre.classList.remove('en-code-v4-has-output')
      state.pre.style.removeProperty('--en-code-v4-output-height')
      return
    }
    const height = Math.ceil(state.output.getBoundingClientRect().height)
    if (height > 0) {
      state.pre.classList.add('en-code-v4-has-output')
      state.pre.style.setProperty('--en-code-v4-output-height', `${height}px`)
    }
  }
  const layout = () => {
    layoutPending = false
    const viewportHeight = Number(target.innerHeight) || 10000
    for (const state of states.values()) {
      const connected = Boolean(state.pre?.isConnected)
      if (state.toolbar) state.toolbar.hidden = !connected
      if (state.output) state.output.hidden = !connected || (state.status === 'idle' && !state.result)
      if (!connected) continue
      const rect = state.pre.getBoundingClientRect()
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight
      if (state.toolbar) {
        state.toolbar.hidden = !visible
        if (visible) {
          const width = state.toolbar.offsetWidth || 64
          state.toolbar.style.left = `${Math.max(8, rect.right - width - 10)}px`
          state.toolbar.style.top = `${Math.max(8, rect.top + 9)}px`
        }
      }
      if (state.output && !state.output.hidden) {
        state.output.style.left = `${Math.max(8, rect.left)}px`
        state.output.style.top = `${Math.max(8, rect.bottom + 6)}px`
        state.output.style.width = `${Math.max(220, rect.width)}px`
      }
      reserveOutput(state)
    }
  }
  const scheduleLayout = () => {
    if (layoutPending || disposed) return
    layoutPending = true
    ;(target.requestAnimationFrame || ((callback) => setTimeout(callback, 0)))(layout)
  }

  const updateToolbar = (state) => {
    if (!state.toolbar) return
    const running = state.status === 'running' || state.status === 'stopping'
    state.runButton.disabled = !state.language && !running
    state.runButton.classList.toggle('is-running', running)
    state.runButton.classList.toggle('is-stopping', state.status === 'stopping')
    state.runButton.setAttribute('aria-label', running ? 'Stop code execution' : 'Run code block')
    state.runButton.title = running
      ? (state.status === 'stopping' ? 'Stopping…' : 'Stop execution')
      : 'Run code block · Cmd/Ctrl+Enter'
    scheduleLayout()
  }

  const renderOutput = (state) => {
    if (state.status === 'idle' && !state.result) {
      state.output?.remove()
      state.output = null
      reserveOutput(state)
      scheduleLayout()
      return
    }
    if (!state.output) {
      state.output = make('section', 'en-code-v4-output')
      state.output.contentEditable = 'false'
      layer.append(state.output)
    }
    const output = state.output
    const result = state.result || {}
    const running = state.status === 'running' || state.status === 'stopping'
    output.hidden = false
    output.classList.toggle('is-running', running)
    output.classList.toggle('is-error', !running && result.success !== true && !result.interrupted)
    output.replaceChildren()

    const header = make('header', 'en-code-v4-output-header')
    const status = make('div', 'en-code-v4-output-status')
    const title = make('strong', '', running
      ? (state.status === 'stopping' ? 'Stopping' : 'Running')
      : result.interrupted ? 'Stopped' : result.success ? 'Output' : 'Error')
    const metaParts = running ? [state.language || 'Code'] : [
      result.environment || result.language || state.language,
      Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
      result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
      result.timedOut ? 'timed out' : '',
      result.truncated ? 'truncated' : ''
    ].filter(Boolean)
    status.append(make('span', 'en-code-v4-status-dot'), title, make('span', 'en-code-v4-output-meta', metaParts.join(' · ')))
    const actions = make('div', 'en-code-v4-output-actions')
    const copy = make('button', '', 'Copy')
    const collapse = make('button', '', 'Collapse')
    const clear = make('button', '', 'Clear')
    for (const button of [copy, collapse, clear]) button.type = 'button'
    copy.disabled = running || (!result.stdout && !result.stderr && !result.error)
    collapse.disabled = clear.disabled = running
    actions.append(copy, collapse, clear)
    header.append(status, actions)
    const body = make('div', 'en-code-v4-output-body')
    output.append(header, body)

    copy.addEventListener('click', async() => {
      try {
        await copyText(target, [result.stdout, result.stderr || result.error].filter(Boolean).join('\n'))
        copy.textContent = 'Copied'
        setTimeout(() => { copy.textContent = 'Copy' }, 1000)
      } catch { copy.textContent = 'Copy failed' }
    })
    collapse.addEventListener('click', () => {
      body.hidden = !body.hidden
      collapse.textContent = body.hidden ? 'Expand' : 'Collapse'
      scheduleLayout()
    })
    clear.addEventListener('click', () => {
      state.status = 'idle'
      state.result = null
      updateToolbar(state)
      renderOutput(state)
    })

    if (running) {
      body.append(make('div', 'en-code-v4-progress'))
    } else {
      const appendStream = (label, value, isError = false) => {
        if (!value) return
        const stream = make('section', `en-code-v4-stream${isError ? ' is-error' : ''}`)
        stream.append(make('div', 'en-code-v4-stream-label', label), make('pre', '', value))
        body.append(stream)
      }
      appendStream('stdout', result.stdout)
      appendStream('stderr', result.stderr || result.error, true)
      if (!result.stdout && !result.stderr && !result.error) {
        body.append(make('p', 'en-code-v4-empty', result.interrupted
          ? 'The program was stopped before producing output.'
          : 'The program completed without output.'))
      }
    }
    scheduleLayout()
  }

  const stop = async(state) => {
    if (!state.executionId || state.status === 'stopping') return
    const executionId = state.executionId
    state.status = 'stopping'
    updateToolbar(state)
    renderOutput(state)
    try {
      const result = await invokePrograms(target, 'stop', { executionId })
      if (!result?.stopped && state.executionId === executionId) state.status = 'running'
    } catch (error) {
      if (state.executionId === executionId) state.status = 'running'
      log('error', 'stop:error', { blockId: state.id, executionId, error: errorMessage(error) })
    }
    updateToolbar(state)
    renderOutput(state)
  }

  const run = async(state) => {
    if (state.status === 'running' || state.status === 'stopping') return stop(state)
    state.language = languageOf(state.pre)
    const source = codeOf(state.pre)
    if (!state.language) {
      state.status = 'done'
      state.result = { success: false, error: 'Choose a language before running this block.' }
      updateToolbar(state)
      renderOutput(state)
      return
    }
    const executionId = `execution-${Date.now().toString(36)}-${++sequence}`
    const started = now()
    state.executionId = executionId
    state.status = 'running'
    state.result = null
    updateToolbar(state)
    renderOutput(state)
    log('info', 'run:dispatch', {
      blockId: state.id,
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
      updateToolbar(state)
      renderOutput(state)
      log('info', 'run:finished', { blockId: state.id, executionId, durationMs: elapsed(started) })
    }
  }

  const createToolbar = (state) => {
    const toolbar = make('div', 'en-code-v4-toolbar')
    const copyButton = make('button', 'en-code-v4-copy')
    const copyIcon = make('span', 'en-code-v4-copy-icon')
    const runButton = make('button', 'en-code-v4-run')
    const runIcon = make('span', 'en-code-v4-run-icon')
    toolbar.contentEditable = 'false'
    copyButton.type = runButton.type = 'button'
    copyButton.setAttribute('aria-label', 'Copy code')
    copyButton.title = 'Copy code'
    copyButton.append(copyIcon)
    runButton.append(runIcon)
    toolbar.append(copyButton, runButton)
    copyButton.addEventListener('mousedown', (event) => event.preventDefault())
    copyButton.addEventListener('click', async(event) => {
      event.preventDefault()
      event.stopPropagation()
      try {
        await copyText(target, codeOf(state.pre))
        copyButton.classList.add('is-copied')
        setTimeout(() => copyButton.classList.remove('is-copied'), 900)
      } catch (error) {
        log('error', 'copy:error', { blockId: state.id, error: errorMessage(error) })
      }
    })
    runButton.addEventListener('mousedown', (event) => event.preventDefault())
    runButton.addEventListener('pointerdown', () => {
      log('debug', 'run-button:pointerdown', { blockId: state.id, status: state.status })
    })
    runButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void run(state)
    })
    layer.append(toolbar)
    state.toolbar = toolbar
    state.copyButton = copyButton
    state.runButton = runButton
  }

  const installEditing = (state) => {
    const code = state.pre?.querySelector?.('code')
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
        void run(state)
        return
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

  const attachState = (state, root, pre, ordinal) => {
    const previousPre = state.pre
    if (previousPre && previousPre !== pre) resizeObserver?.unobserve?.(previousPre)
    state.root = root
    state.rootId = rootId(root)
    state.pre = pre
    state.ordinal = ordinal
    state.language = languageOf(pre)
    state.fingerprint = fingerprint(pre)
    state.lastSeenAt = Date.now()
    state.claimed = true
    byPre.set(pre, state)
    if (!state.toolbar) createToolbar(state)
    installEditing(state)
    enhanceNativeChrome(state)
    updateToolbar(state)
    resizeObserver?.observe?.(pre)
    scheduleLayout()
  }

  const stateFor = (root, pre, ordinal) => {
    const direct = byPre.get(pre)
    if (direct) return direct
    const id = rootId(root)
    const mark = fingerprint(pre)
    const candidates = [...states.values()].filter((state) =>
      !state.claimed && state.rootId === id && !state.pre?.isConnected)
    const state = candidates.find((candidate) => candidate.fingerprint === mark) ||
      candidates.find((candidate) => candidate.ordinal === ordinal) || {
        id: `block-${++sequence}`,
        root,
        rootId: id,
        pre: null,
        ordinal,
        fingerprint: mark,
        language: '',
        status: 'idle',
        result: null,
        executionId: null,
        toolbar: null,
        output: null,
        chrome: null,
        claimed: false,
        lastSeenAt: Date.now()
      }
    states.set(state.id, state)
    return state
  }

  const pruneDetached = () => {
    const time = Date.now()
    for (const [id, state] of states) {
      if (state.claimed || state.pre?.isConnected || time - state.lastSeenAt < DETACHED_TTL) continue
      if (state.executionId) void invokePrograms(target, 'stop', { executionId: state.executionId })
      resizeObserver?.unobserve?.(state.pre)
      clearNativeChrome(state)
      state.toolbar?.remove()
      state.output?.remove()
      states.delete(id)
    }
  }

  const scan = (reason = 'manual') => {
    if (disposed) return
    if (scanTimer) {
      clearTimeout(scanTimer)
      scanTimer = null
    }
    metrics.scans += 1
    for (const state of states.values()) state.claimed = false
    let created = 0
    let rebound = 0
    for (const root of outerRoots()) {
      const blocks = [...root.querySelectorAll('pre')].filter((pre) => pre.querySelector('code'))
      blocks.forEach((pre, ordinal) => {
        const state = stateFor(root, pre, ordinal)
        const wasNew = !state.toolbar
        const wasRebound = Boolean(state.pre && state.pre !== pre)
        attachState(state, root, pre, ordinal)
        if (wasNew) created += 1
        else if (wasRebound) rebound += 1
      })
    }
    pruneDetached()
    if (created || rebound) {
      metrics.topologyChanges += created + rebound
      log('debug', 'scan:topology', { reason, created, rebound, blocks: states.size })
    }
    void installSettings()
  }

  const scheduleScan = (reason = 'mutation') => {
    if (disposed) return
    metrics.scheduledScans += 1
    if (scanTimer) {
      metrics.coalescedScans += 1
      return
    }
    scanTimer = setTimeout(() => scan(reason), SCAN_DEBOUNCE_MS)
  }

  const isRuntimeTarget = (node) => node === layer || layer.contains(node) || node?.closest?.('.en-code-v4-layer')
  const topologyNode = (node) => node?.nodeType === 1 && (
    node.matches?.(`pre, code, ${ROOTS}, ${HOSTS}, ${SETTINGS_HOST}`) ||
    node.querySelector?.(`pre, ${ROOTS}, ${HOSTS}, ${SETTINGS_HOST}`)
  )
  const mutationNeedsScan = (record) => {
    if (isRuntimeTarget(record.target)) {
      metrics.ignoredMutations += 1
      return false
    }
    if (record.type === 'attributes') {
      return record.target?.matches?.(`pre, code, ${LANGUAGE_INPUT}`)
    }
    return [...record.addedNodes, ...record.removedNodes].some(topologyNode)
  }

  const observer = new MutationObserver((records) => {
    if (records.some(mutationNeedsScan)) scheduleScan('editor-topology')
  })
  observer.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-language', 'data-lang', 'lang']
  })

  const languageChanged = (event) => {
    if (event.target?.matches?.(LANGUAGE_INPUT)) scheduleScan('language-change')
  }
  document.addEventListener('input', languageChanged, true)
  document.addEventListener('change', languageChanged, true)
  const viewportChanged = () => scheduleLayout()
  document.addEventListener('scroll', viewportChanged, true)
  target.addEventListener?.('resize', viewportChanged)
  if (typeof target.ResizeObserver === 'function') {
    resizeObserver = new target.ResizeObserver(() => scheduleLayout())
  }

  const settingsConfig = (state) => ({
    executionEnabled: state.executionEnabled === true,
    outputLineLimit: normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_LINES),
    environments: Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
      enabled: environment.enabled !== false,
      executable: environment.configuredExecutable || ''
    }]))
  })
  const saveSettings = async(state) => Object.assign(
    state,
    await invokePrograms(target, 'set', settingsConfig(state))
  )
  const renderSettings = (host, state) => {
    host.replaceChildren(make('div', 'en-code-settings-title', 'Code execution'))
    const enabledRow = make('div', 'en-settings-row')
    const enabledCopy = make('div', 'en-settings-row-copy')
    enabledCopy.append(make('strong', '', 'Code execution'), make('span', '', 'Run trusted fenced code with local interpreters.'))
    const enabled = make('button', `en-switch${state.executionEnabled ? ' active' : ''}`)
    enabled.type = 'button'
    enabled.setAttribute('role', 'switch')
    enabled.setAttribute('aria-checked', state.executionEnabled ? 'true' : 'false')
    enabled.append(make('span'))
    enabled.addEventListener('click', async() => {
      state.executionEnabled = !state.executionEnabled
      await saveSettings(state)
      renderSettings(host, state)
    })
    enabledRow.append(enabledCopy, enabled)
    host.append(enabledRow)

    const outputRow = make('div', 'en-settings-row')
    const outputCopy = make('div', 'en-settings-row-copy')
    outputCopy.append(make('strong', '', 'Retained output'), make('span', '', 'Keep only the final stdout and stderr lines.'))
    const select = make('select', 'en-compact-select')
    for (const value of [20, 50, 100, 200, 500, 1000, 5000]) {
      const option = make('option', '', value === 5000 ? '5,000 lines' : `${value} lines`)
      option.value = String(value)
      option.selected = Number(state.outputLineLimit) === value
      select.append(option)
    }
    select.addEventListener('change', async() => {
      state.outputLineLimit = normalizeOutputLineLimit(select.value, DEFAULT_LINES)
      await saveSettings(state)
    })
    outputRow.append(outputCopy, select)
    host.append(outputRow, make('div', 'en-code-settings-note', 'Programs run with your normal user permissions and are not sandboxed.'))
  }
  let settingsLoading = false
  const installSettings = async() => {
    const content = document.querySelector(SETTINGS_HOST)
    if (!content || content.querySelector(`[${SETTINGS_MARKER}]`) || settingsLoading) return
    const marker = content.querySelector('.en-settings-group')
    if (!marker) return
    settingsLoading = true
    const host = make('section', 'en-settings-group en-code-settings-group')
    host.setAttribute(SETTINGS_MARKER, 'true')
    host.append(make('p', 'en-code-settings-loading', 'Detecting local environments…'))
    marker.insertAdjacentElement('afterend', host)
    try {
      const state = await invokePrograms(target, 'list')
      state.outputLineLimit = normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_LINES)
      renderSettings(host, state)
    } catch (error) {
      host.replaceChildren(make('p', 'en-code-settings-error', errorMessage(error)))
    } finally {
      settingsLoading = false
    }
  }

  return {
    layer,
    states,
    metrics,
    scan,
    scheduleScan,
    scheduleLayout,
    dispose: () => {
      disposed = true
      if (scanTimer) clearTimeout(scanTimer)
      observer.disconnect()
      resizeObserver?.disconnect?.()
      document.removeEventListener('input', languageChanged, true)
      document.removeEventListener('change', languageChanged, true)
      document.removeEventListener('scroll', viewportChanged, true)
      target.removeEventListener?.('resize', viewportChanged)
      for (const state of states.values()) {
        clearNativeChrome(state)
        state.pre?.classList.remove('en-code-v4-pre', 'en-code-v4-has-output')
        state.pre?.style.removeProperty('--en-code-v4-output-height')
        state.toolbar?.remove()
        state.output?.remove()
      }
      states.clear()
      layer.remove()
      delete target.__ELEPHANT_CODE_RUNTIME__
    }
  }
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  if (target.__ELEPHANT_CODE_RUNTIME__) return target.__ELEPHANT_CODE_RUNTIME__
  installApi(target)
  const runtime = createRuntime(target)
  target.__ELEPHANT_CODE_RUNTIME__ = runtime
  runtime.scheduleScan('install')
  log('info', 'install:complete', {
    runtime: 'v4-consolidated',
    scanDebounceMs: SCAN_DEBOUNCE_MS,
    watchdogMs: RUN_TIMEOUT
  })
  return runtime
}

export const resetExecutableCodeBlocksForTests = (target = globalThis) => {
  target.__ELEPHANT_CODE_RUNTIME__?.dispose?.()
  sequence = 0
}

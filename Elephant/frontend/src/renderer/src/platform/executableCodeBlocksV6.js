import './executableCodeBlocks.v2.css'
import './executableCodeBlocksV6.css'
import { indentationEdit, indentationForNewline, normalizeOutputLineLimit } from './executableCodeEditing'

const ROOTS = '.en-editor-host, .muya-container, .ag-editor'
const HOSTS = '[data-code-block], [data-role="code-block"], [data-type="code-block"], .ag-code-block, .code-block'
const SETTINGS_HOST = '.en-settings-content'
const SETTINGS_MARKER = 'data-elephant-code-settings-v6'
const LANGUAGE_INPUT = [
  '.ag-language-input', '.language-input', '.ag-code-language', '.code-block-language',
  '[data-function-type="languageInput"]', '[functiontype="languageInput"]',
  '[data-role="language-input"]', '[data-language-input]',
  '[data-placeholder*="language" i]', '[placeholder*="language" i]', '[aria-label*="language" i]'
].join(', ')
const RUNTIME_UI = '.en-code-v6-toolbar, .en-code-v6-output'
const LANGUAGES = [
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['bash', 'Bash'],
  ['sh', 'Shell'],
  ['ruby', 'Ruby'],
  ['php', 'PHP'],
  ['powershell', 'PowerShell']
]
const DEFAULT_LINES = 200
const RUN_TIMEOUT = 22_000
const IPC_TIMEOUT = 10_000
const DETACHED_TTL = 800
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
const hostOf = (pre) => pre?.closest?.(HOSTS) || pre?.parentElement || pre
const findLanguageInput = (pre) => {
  const host = hostOf(pre)
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
  return [...elements].filter((element) =>
    !pre?.contains?.(element) && !element.matches?.(RUNTIME_UI) && !element.closest?.(RUNTIME_UI))
}
const findNativeChrome = (pre, language) => {
  const host = hostOf(pre)
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
  state.chrome?.host?.classList?.remove('en-code-v6-shell')
  state.chrome?.languageControl?.classList?.remove('en-code-v6-native-language')
  state.chrome?.copyControl?.classList?.remove('en-code-v6-native-copy')
  state.chrome?.fenceHint?.classList?.remove('en-code-v6-fence-hint')
  state.pre?.classList?.remove('en-code-v6-pre')
}
const enhanceNativeChrome = (state) => {
  const chrome = findNativeChrome(state.pre, state.language)
  if (state.chrome?.host !== chrome.host ||
      state.chrome?.languageControl !== chrome.languageControl ||
      state.chrome?.copyControl !== chrome.copyControl ||
      state.chrome?.fenceHint !== chrome.fenceHint) clearNativeChrome(state)
  chrome.host?.classList?.add('en-code-v6-shell')
  chrome.languageControl?.classList?.add('en-code-v6-native-language')
  chrome.copyControl?.classList?.add('en-code-v6-native-copy')
  chrome.fenceHint?.classList?.add('en-code-v6-fence-hint')
  state.pre?.classList?.add('en-code-v6-pre')
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
const replaceLanguageClass = (node, language) => {
  if (!node) return
  for (const className of [...node.classList]) {
    if (className.startsWith('language-') || className.startsWith('lang-')) node.classList.remove(className)
  }
  node.classList.add(`language-${language}`)
  node.dataset.language = language
}
const writeNativeLanguage = (state, language) => {
  const native = state.chrome?.languageControl || findLanguageInput(state.pre)
  if (native) {
    if ('value' in native) native.value = language
    native.dataset.value = language
    if (!native.matches?.('input, select, textarea')) native.textContent = language
    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: language })
      : new Event('input', { bubbles: true })
    native.dispatchEvent(inputEvent)
    native.dispatchEvent(new Event('change', { bubbles: true }))
  }
  replaceLanguageClass(state.pre, language)
  replaceLanguageClass(state.pre?.querySelector?.('code'), language)
  state.language = language
  state.fingerprint = fingerprint(state.pre)
  if (state.languageSelect && state.languageSelect.value !== language) state.languageSelect.value = language
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
  const states = new Map()
  const byPre = new WeakMap()
  const rootIds = new WeakMap()
  const editingInstalled = new WeakSet()
  let rootSequence = 0
  let scanTimer = null
  let pruneTimer = null
  let disposed = false
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
  const usableBackground = (value) => value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)'
  const applyTheme = (state) => {
    const preStyle = target.getComputedStyle?.(state.pre)
    const hostStyle = target.getComputedStyle?.(state.host)
    const surface = usableBackground(preStyle?.backgroundColor)
      ? preStyle.backgroundColor
      : usableBackground(hostStyle?.backgroundColor) ? hostStyle.backgroundColor : '#29292c'
    const text = preStyle?.color || hostStyle?.color || '#d8d8da'
    state.host?.style?.setProperty('--en-code-v6-surface', surface)
    state.host?.style?.setProperty('--en-code-v6-text', text)
  }
  const refreshLanguageOptions = (state) => {
    if (!state.languageSelect) return
    const language = state.language || 'python'
    const known = LANGUAGES.some(([id]) => id === language)
    state.languageSelect.replaceChildren()
    if (!known) {
      const option = make('option', '', language || 'Code')
      option.value = language
      state.languageSelect.append(option)
    }
    for (const [id, label] of LANGUAGES) {
      const option = make('option', '', label)
      option.value = id
      state.languageSelect.append(option)
    }
    state.languageSelect.value = language
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
    if (state.languageSelect.value !== state.language) refreshLanguageOptions(state)
  }

  const renderOutput = (state) => {
    if (!state.output) return
    const visible = state.status !== 'idle' || Boolean(state.result)
    state.output.hidden = !visible
    state.host?.classList?.toggle('en-code-v6-has-output', visible)
    if (!visible) {
      state.output.replaceChildren()
      return
    }
    const output = state.output
    const result = state.result || {}
    const running = state.status === 'running' || state.status === 'stopping'
    output.classList.toggle('is-running', running)
    output.classList.toggle('is-error', !running && result.success !== true && !result.interrupted)
    output.replaceChildren()

    const header = make('header', 'en-code-v6-output-header')
    const status = make('div', 'en-code-v6-output-status')
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
    status.append(
      make('span', 'en-code-v6-status-dot'),
      title,
      make('span', 'en-code-v6-output-meta', metaParts.join(' · '))
    )
    const actions = make('div', 'en-code-v6-output-actions')
    const copy = make('button', '', 'Copy')
    const collapse = make('button', '', state.outputCollapsed ? 'Expand' : 'Collapse')
    const clear = make('button', '', 'Clear')
    for (const button of [copy, collapse, clear]) button.type = 'button'
    copy.disabled = running || (!result.stdout && !result.stderr && !result.error)
    collapse.disabled = clear.disabled = running
    actions.append(copy, collapse, clear)
    header.append(status, actions)
    const body = make('div', 'en-code-v6-output-body')
    body.hidden = state.outputCollapsed === true
    output.append(header, body)

    copy.addEventListener('click', async() => {
      try {
        await copyText(target, [result.stdout, result.stderr || result.error].filter(Boolean).join('\n'))
        copy.textContent = 'Copied'
        setTimeout(() => { copy.textContent = 'Copy' }, 1000)
      } catch { copy.textContent = 'Copy failed' }
    })
    collapse.addEventListener('click', () => {
      state.outputCollapsed = !state.outputCollapsed
      renderOutput(state)
    })
    clear.addEventListener('click', () => {
      state.status = 'idle'
      state.result = null
      state.outputCollapsed = false
      updateToolbar(state)
      renderOutput(state)
    })

    if (running) {
      body.append(make('div', 'en-code-v6-progress'))
    } else {
      const appendStream = (label, value, isError = false) => {
        if (!value) return
        const stream = make('section', `en-code-v6-stream${isError ? ' is-error' : ''}`)
        stream.append(make('div', 'en-code-v6-stream-label', label), make('pre', '', value))
        body.append(stream)
      }
      appendStream('stdout', result.stdout)
      appendStream('stderr', result.stderr || result.error, true)
      if (!result.stdout && !result.stderr && !result.error) {
        body.append(make('p', 'en-code-v6-empty', result.interrupted
          ? 'The program was stopped before producing output.'
          : 'The program completed without output.'))
      }
    }
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
    state.language = languageOf(state.pre) || state.languageSelect?.value || ''
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
    state.outputCollapsed = false
    updateToolbar(state)
    renderOutput(state)
    log('info', 'run:dispatch', {
      blockId: state.id,
      executionId,
      language: state.language,
      codeBytes: byteLength(source)
    })
    try {
      const result = await invokePrograms(target, 'run', { id: state.language, command: source, executionId })
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

  const createInlineUi = (state) => {
    const toolbar = make('div', 'en-code-v6-toolbar')
    const languageSelect = make('select', 'en-code-v6-language')
    const actions = make('div', 'en-code-v6-toolbar-actions')
    const copyButton = make('button', 'en-code-v6-copy')
    const copyIcon = make('span', 'en-code-v6-copy-icon')
    const runButton = make('button', 'en-code-v6-run')
    const runIcon = make('span', 'en-code-v6-run-icon')
    const output = make('section', 'en-code-v6-output')
    toolbar.contentEditable = 'false'
    output.contentEditable = 'false'
    copyButton.type = runButton.type = 'button'
    languageSelect.setAttribute('aria-label', 'Code language')
    copyButton.setAttribute('aria-label', 'Copy code')
    copyButton.title = 'Copy code'
    copyButton.append(copyIcon)
    runButton.append(runIcon)
    actions.append(copyButton, runButton)
    toolbar.append(languageSelect, actions)
    output.hidden = true

    languageSelect.addEventListener('change', () => {
      writeNativeLanguage(state, normalizeLanguage(languageSelect.value))
      updateToolbar(state)
    })
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
    runButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void run(state)
    })

    state.toolbar = toolbar
    state.languageSelect = languageSelect
    state.copyButton = copyButton
    state.runButton = runButton
    state.output = output
    refreshLanguageOptions(state)
  }

  const mountInlineUi = (state) => {
    const host = state.host
    if (!host || !state.pre) return
    if (!state.toolbar || !state.output) createInlineUi(state)
    if (state.toolbar.parentElement !== host) host.insertBefore(state.toolbar, state.pre)
    if (state.output.parentElement !== host || state.output.previousElementSibling !== state.pre) {
      state.pre.insertAdjacentElement('afterend', state.output)
    }
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
    const previousHost = state.host
    state.root = root
    state.rootId = rootId(root)
    state.pre = pre
    state.host = hostOf(pre)
    state.ordinal = ordinal
    state.language = languageOf(pre) || state.language || 'python'
    state.fingerprint = fingerprint(pre)
    state.lastSeenAt = Date.now()
    state.claimed = true
    byPre.set(pre, state)
    if (previousHost && previousHost !== state.host) {
      clearNativeChrome(state)
      state.toolbar?.remove()
      state.output?.remove()
    }
    enhanceNativeChrome(state)
    mountInlineUi(state)
    refreshLanguageOptions(state)
    installEditing(state)
    updateToolbar(state)
    renderOutput(state)
    applyTheme(state)
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
        host: null,
        ordinal,
        fingerprint: mark,
        language: '',
        status: 'idle',
        result: null,
        executionId: null,
        outputCollapsed: false,
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
    pruneTimer = null
    const time = Date.now()
    for (const [id, state] of states) {
      if (state.claimed || state.pre?.isConnected || time - state.lastSeenAt < DETACHED_TTL) continue
      if (state.executionId) void invokePrograms(target, 'stop', { executionId: state.executionId })
      clearNativeChrome(state)
      state.toolbar?.remove()
      state.output?.remove()
      states.delete(id)
    }
  }
  const schedulePrune = () => {
    if (pruneTimer) clearTimeout(pruneTimer)
    pruneTimer = setTimeout(pruneDetached, DETACHED_TTL + 20)
  }

  const settingsConfig = (state) => ({
    executionEnabled: state.executionEnabled === true,
    outputLineLimit: normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_LINES),
    environments: Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
      enabled: environment.enabled !== false,
      executable: environment.configuredExecutable || ''
    }]))
  })
  const saveSettings = async(state) => Object.assign(state, await invokePrograms(target, 'set', settingsConfig(state)))
  const renderSettings = (host, state) => {
    host.replaceChildren(make('div', 'en-code-settings-title', 'Code execution'))
    const enabledRow = make('div', 'en-settings-row')
    const enabledCopy = make('div', 'en-settings-row-copy')
    enabledCopy.append(
      make('strong', '', 'Code execution'),
      make('span', '', 'Run trusted fenced code with local interpreters.')
    )
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
    outputCopy.append(
      make('strong', '', 'Retained output'),
      make('span', '', 'Keep only the final stdout and stderr lines.')
    )
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
    host.append(
      outputRow,
      make('div', 'en-code-settings-note', 'Programs run with your normal user permissions and are not sandboxed.')
    )
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
      const blocks = [...root.querySelectorAll('pre')].filter((pre) =>
        pre.querySelector('code') && !pre.closest(RUNTIME_UI))
      blocks.forEach((pre, ordinal) => {
        const state = stateFor(root, pre, ordinal)
        const wasNew = !state.toolbar
        const wasRebound = Boolean(state.pre && state.pre !== pre)
        attachState(state, root, pre, ordinal)
        if (wasNew) created += 1
        else if (wasRebound) rebound += 1
      })
    }
    schedulePrune()
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
  const isRuntimeNode = (node) => node?.nodeType === 1 && (
    node.matches?.(RUNTIME_UI) || node.closest?.(RUNTIME_UI) || node.querySelector?.(RUNTIME_UI)
  )
  const topologyNode = (node) => node?.nodeType === 1 && !isRuntimeNode(node) && (
    node.matches?.(`pre, code, ${ROOTS}, ${HOSTS}, ${SETTINGS_HOST}`) ||
    node.querySelector?.(`pre, ${ROOTS}, ${HOSTS}, ${SETTINGS_HOST}`)
  )
  const observer = new MutationObserver((records) => {
    const needsScan = records.some((record) => {
      if (record.target?.closest?.(RUNTIME_UI)) {
        metrics.ignoredMutations += 1
        return false
      }
      return [...record.addedNodes, ...record.removedNodes].some(topologyNode)
    })
    if (needsScan) scheduleScan('editor-topology')
  })
  observer.observe(document.documentElement || document.body, { subtree: true, childList: true })

  const nativeLanguageChanged = (event) => {
    if (!event.target?.matches?.(LANGUAGE_INPUT)) return
    for (const state of states.values()) {
      if (state.chrome?.languageControl !== event.target) continue
      const language = normalizeLanguage(
        event.target.value || event.target.dataset?.value || event.target.textContent || ''
      )
      if (!language || language === state.language) return
      state.language = language
      state.fingerprint = fingerprint(state.pre)
      refreshLanguageOptions(state)
      updateToolbar(state)
      return
    }
  }
  document.addEventListener('input', nativeLanguageChanged, true)
  document.addEventListener('change', nativeLanguageChanged, true)

  const runtime = {
    version: 'v6',
    layer: null,
    states,
    metrics,
    scan,
    scheduleScan,
    dispose: () => {
      disposed = true
      if (scanTimer) clearTimeout(scanTimer)
      if (pruneTimer) clearTimeout(pruneTimer)
      observer.disconnect()
      document.removeEventListener('input', nativeLanguageChanged, true)
      document.removeEventListener('change', nativeLanguageChanged, true)
      for (const state of states.values()) {
        clearNativeChrome(state)
        state.toolbar?.remove()
        state.output?.remove()
        state.host?.classList?.remove('en-code-v6-has-output')
        state.host?.style?.removeProperty('--en-code-v6-surface')
        state.host?.style?.removeProperty('--en-code-v6-text')
      }
      states.clear()
      if (target.__ELEPHANT_CODE_RUNTIME__ === runtime) delete target.__ELEPHANT_CODE_RUNTIME__
    }
  }
  return runtime
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  const existing = target.__ELEPHANT_CODE_RUNTIME__
  if (existing?.version === 'v6') return existing
  existing?.dispose?.()
  installApi(target)
  const runtime = createRuntime(target)
  target.__ELEPHANT_CODE_RUNTIME__ = runtime
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runtime.scheduleScan('dom-content-loaded'), { once: true })
  } else {
    runtime.scheduleScan('install')
  }
  log('info', 'install:complete', { runtime: 'v6-inline-shell', outputLineLimit: DEFAULT_LINES })
  return runtime
}

export const resetExecutableCodeBlocksForTests = (target = globalThis) => {
  target.__ELEPHANT_CODE_RUNTIME__?.dispose?.()
  sequence = 0
}

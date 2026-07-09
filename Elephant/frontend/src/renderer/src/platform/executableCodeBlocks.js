import './executableCodeBlocks.css'
import { applyLanguageUiState, relevantLanguageMutations } from './executableCodeBlockObserver'
import {
  indentationEdit,
  indentationForNewline,
  normalizeOutputLineLimit
} from './executableCodeEditing'

const ENHANCED_ATTRIBUTE = 'data-elephant-code-runner'
const OUTPUT_ATTRIBUTE = 'data-elephant-code-output'
const TOOLBAR_ATTRIBUTE = 'data-elephant-code-toolbar'
const SETTINGS_ATTRIBUTE = 'data-elephant-code-settings'
const LANGUAGE_CLASS_PREFIXES = ['language-', 'lang-']
const RUN_WATCHDOG_MS = 20_000
const IPC_WATCHDOG_MS = 10_000
const DEFAULT_OUTPUT_LINE_LIMIT = 200
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
const runningBlocks = new WeakSet()
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

const logCode = (level, event, details = {}) => {
  const method = console[level] || console.log
  method.call(console, `[Code:UI] ${event}`, details)
}

const nextRequestId = (action) => `${action}-${Date.now().toString(36)}-${++requestSequence}`
const blockIdFor = (pre, toolbar = null) => {
  const existing = pre.dataset.elephantCodeBlockId || toolbar?.dataset.elephantCodeBlockId
  if (existing) {
    pre.dataset.elephantCodeBlockId = existing
    if (toolbar) toolbar.dataset.elephantCodeBlockId = existing
    return existing
  }
  const blockId = `block-${++blockSequence}`
  pre.dataset.elephantCodeBlockId = blockId
  if (toolbar) toolbar.dataset.elephantCodeBlockId = blockId
  return blockId
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
    language,
    commandBytes: action === 'run' ? byteLength(command) : 0,
    cwd: payload.cwd || null,
    timeoutMs
  })

  if (typeof invoke !== 'function') {
    const error = new Error('The Tauri command API is unavailable for code execution.')
    logCode('error', 'invoke:error', { requestId, action, durationMs: elapsedMs(started), error: error.message })
    throw error
  }

  let invocation
  if (action === 'list') invocation = invoke('tauri_programs_list')
  else if (action === 'set') invocation = invoke('tauri_programs_set', { environments: payload })
  else if (action === 'run') {
    invocation = invoke('tauri_programs_run', {
      id: language,
      command,
      cwd: payload.cwd || null
    })
  } else {
    const error = new Error(`Unsupported programs action: ${action}`)
    logCode('error', 'invoke:error', { requestId, action, durationMs: elapsedMs(started), error: error.message })
    throw error
  }

  try {
    const result = await withWatchdog(
      Promise.resolve(invocation),
      timeoutMs,
      `Code execution IPC did not answer within ${timeoutMs} ms. Check the [Code] backend logs.`,
      () => logCode('error', 'invoke:watchdog-timeout', { requestId, action, language, timeoutMs })
    )
    updateRuntimeSettings(result)
    logCode('info', 'invoke:complete', {
      requestId,
      action,
      language,
      durationMs: elapsedMs(started),
      success: result?.success,
      exitCode: result?.exitCode,
      timedOut: result?.timedOut,
      truncated: result?.truncated,
      outputLineLimit: result?.outputLineLimit,
      stdoutBytes: byteLength(result?.stdout || ''),
      stderrBytes: byteLength(result?.stderr || '')
    })
    return result
  } catch (error) {
    logCode('error', 'invoke:error', {
      requestId,
      action,
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
    run: (payload = {}) => invokePrograms(target, 'run', payload)
  }

  const api = target.elephantnote.api
  if (!api?.call || api.call.__elephantProgramsPatched) return
  const originalCall = api.call.bind(api)
  const patchedCall = async(action, payload = {}) => {
    if (action === 'programs.list') return { ok: true, data: await invokePrograms(target, 'list') }
    if (action === 'programs.set') {
      return { ok: true, data: await invokePrograms(target, 'set', payload.environments || payload) }
    }
    if (action === 'programs.run') {
      return { ok: true, data: await invokePrograms(target, 'run', payload) }
    }
    return originalCall(action, payload)
  }
  patchedCall.__elephantProgramsPatched = true
  api.call = patchedCall
  logCode('info', 'api:patched', { actions: ['programs.list', 'programs.set', 'programs.run'] })
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
    pre.closest?.('[data-code-block], .ag-code-block, .code-block, [data-role="code-block"]'),
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
  const code = pre.querySelector('code')
  const explicit =
    pre.dataset.language ||
    pre.dataset.lang ||
    pre.getAttribute('lang') ||
    code?.dataset.language ||
    code?.dataset.lang ||
    code?.getAttribute('lang') ||
    languageFromClasses(pre) ||
    languageFromClasses(code)
  if (explicit) return normalizeLanguage(explicit)
  return valueFromLanguageNode(findLanguageInput(pre))
}

const codeFromBlock = (pre) => {
  const code = pre.querySelector('code')
  if (code) return code.innerText.replace(/\u00a0/g, ' ')
  return pre.innerText.replace(/\u00a0/g, ' ')
}

const toolbarFor = (pre) => {
  const next = pre.nextElementSibling
  return next?.hasAttribute?.(TOOLBAR_ATTRIBUTE) ? next : null
}

const outputFor = (pre) => {
  const toolbar = toolbarFor(pre)
  const anchor = toolbar || pre
  const next = anchor.nextElementSibling
  if (next?.hasAttribute(OUTPUT_ATTRIBUTE)) return next
  const output = document.createElement('section')
  output.setAttribute(OUTPUT_ATTRIBUTE, 'true')
  output.className = 'en-code-output'
  output.hidden = true
  output.contentEditable = 'false'
  anchor.insertAdjacentElement('afterend', output)
  logCode('debug', 'output:created', { blockId: blockIdFor(pre, toolbar) })
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

const renderOutput = (pre, state, result = {}) => {
  const blockId = blockIdFor(pre, toolbarFor(pre))
  const output = outputFor(pre)
  const lineLimit = normalizeOutputLineLimit(
    result.outputLineLimit,
    runtimeSettings.outputLineLimit
  )
  output.hidden = false
  output.classList.toggle('is-running', state === 'running')
  output.classList.toggle('is-error', state !== 'running' && result.success !== true)
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
  title.textContent = state === 'running' ? 'Running' : result.success ? 'Output' : 'Execution failed'
  meta.textContent =
    state === 'running'
      ? 'Waiting for the local runtime…'
      : [
          result.environment || result.language || '',
          Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
          result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
          result.timedOut ? 'timed out' : '',
          result.truncated ? `last ${lineLimit} lines` : ''
        ]
          .filter(Boolean)
          .join(' · ')
  identity.append(status, copy)
  copy.append(title, meta)

  actions.className = 'en-code-output-actions'
  copyButton.type = 'button'
  copyButton.textContent = 'Copy'
  copyButton.disabled = state === 'running' || (!result.stdout && !result.stderr && !result.error)
  copyButton.addEventListener('click', async() => {
    const value = [result.stdout, result.stderr || result.error].filter(Boolean).join('\n')
    try {
      await copyText(value)
      copyButton.textContent = 'Copied'
      setTimeout(() => { copyButton.textContent = 'Copy' }, 1200)
      logCode('info', 'output:copied', { blockId, bytes: byteLength(value) })
    } catch (error) {
      copyButton.textContent = 'Copy failed'
      logCode('error', 'output:copy:error', { blockId, error: errorMessage(error) })
    }
  })

  collapseButton.type = 'button'
  collapseButton.textContent = 'Collapse'
  collapseButton.disabled = state === 'running'
  collapseButton.setAttribute('aria-expanded', 'true')

  clearButton.type = 'button'
  clearButton.textContent = 'Clear'
  clearButton.addEventListener('click', () => {
    output.remove()
    logCode('info', 'output:cleared', { blockId })
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

  if (state === 'running') {
    const progress = document.createElement('div')
    progress.className = 'en-code-output-progress'
    progress.setAttribute('aria-label', 'Code execution in progress')
    body.append(progress)
    logCode('info', 'output:running', { blockId })
    return
  }

  if (result.truncated) {
    const notice = document.createElement('p')
    notice.className = 'en-code-output-notice'
    const droppedBytes = Number(result.stdoutDroppedBytes || 0) + Number(result.stderrDroppedBytes || 0)
    notice.textContent = droppedBytes > 0
      ? `Earlier output was discarded while the process was running. Showing the last ${lineLimit} lines from a bounded buffer.`
      : `Earlier output was omitted. Showing the last ${lineLimit} lines.`
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
    streamMeta.textContent = Number.isFinite(Number(lineCount)) ? `${lineCount} line${Number(lineCount) === 1 ? '' : 's'}` : ''
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
    empty.textContent = 'The program completed without producing output.'
    body.append(empty)
  }

  requestAnimationFrame(() => {
    streams.forEach((stream) => { stream.scrollTop = stream.scrollHeight })
  })

  logCode(result.success ? 'info' : 'warn', 'output:rendered', {
    blockId,
    success: result.success === true,
    language: result.language || '',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut === true,
    truncated: result.truncated === true,
    outputLineLimit: lineLimit,
    stdoutBytes: byteLength(result.stdout || ''),
    stderrBytes: byteLength(result.stderr || result.error || '')
  })
}

const runBlock = async(target, pre, button) => {
  const blockId = blockIdFor(pre, toolbarFor(pre))
  if (runningBlocks.has(pre)) {
    logCode('warn', 'run:ignored-already-running', { blockId })
    return
  }

  const language = languageFromBlock(pre)
  const code = codeFromBlock(pre)
  logCode('info', 'run:click', {
    blockId,
    language,
    codeBytes: byteLength(code),
    languageInput: describeElement(findLanguageInput(pre))
  })

  if (!language) {
    const error = 'Choose a language for this fenced code block before running it.'
    logCode('warn', 'run:rejected-no-language', { blockId, codeBytes: byteLength(code) })
    renderOutput(pre, 'done', { success: false, error })
    return
  }

  runningBlocks.add(pre)
  button.disabled = true
  button.classList.add('is-running')
  button.querySelector('.en-code-runner-run-label').textContent = 'Running…'
  renderOutput(pre, 'running')
  const started = nowMs()

  try {
    logCode('info', 'run:dispatch', { blockId, language, codeBytes: byteLength(code) })
    const result = await invokePrograms(target, 'run', { id: language, command: code })
    logCode(result?.success ? 'info' : 'warn', 'run:result', {
      blockId,
      language,
      durationMs: elapsedMs(started),
      success: result?.success,
      exitCode: result?.exitCode,
      timedOut: result?.timedOut,
      truncated: result?.truncated,
      outputLineLimit: result?.outputLineLimit
    })
    renderOutput(pre, 'done', result)
  } catch (error) {
    logCode('error', 'run:error', {
      blockId,
      language,
      durationMs: elapsedMs(started),
      error: errorMessage(error)
    })
    renderOutput(pre, 'done', {
      success: false,
      language,
      outputLineLimit: runtimeSettings.outputLineLimit,
      error: errorMessage(error)
    })
  } finally {
    runningBlocks.delete(pre)
    button.disabled = false
    button.classList.remove('is-running')
    button.querySelector('.en-code-runner-run-label').textContent = 'Run'
    logCode('info', 'run:finished', { blockId, language, durationMs: elapsedMs(started) })
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
  root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement }))
  return true
}

const installCodeEditing = (target, pre, runButton) => {
  const code = pre.querySelector('code')
  if (!code || code.dataset.elephantCodeEditing === 'true') return
  code.dataset.elephantCodeEditing = 'true'
  code.spellcheck = false
  code.setAttribute('autocapitalize', 'off')
  code.setAttribute('autocomplete', 'off')
  code.setAttribute('autocorrect', 'off')

  code.addEventListener('keydown', (event) => {
    const currentPre = toolbarFor(pre)?.__elephantPre || pre
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      logCode('info', 'editor:shortcut-run', { blockId: blockIdFor(currentPre, toolbarFor(currentPre)) })
      void runBlock(target, currentPre, runButton)
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
      logCode('debug', event.shiftKey ? 'editor:outdent' : 'editor:indent', {
        blockId: blockIdFor(currentPre, toolbarFor(currentPre)),
        selectionLength: offsets.end - offsets.start
      })
      return
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const language = languageFromBlock(currentPre)
      const newline = indentationForNewline(source, offsets.start, language)
      if (newline !== '\n') {
        event.preventDefault()
        event.stopPropagation()
        replaceTextRange(code, offsets.start, offsets.end, newline)
        logCode('debug', 'editor:auto-indent', {
          blockId: blockIdFor(currentPre, toolbarFor(currentPre)),
          language,
          spaces: newline.length - 1
        })
      }
    }
  })

  logCode('info', 'editor:enhanced', {
    blockId: blockIdFor(pre, toolbarFor(pre)),
    shortcuts: ['Tab', 'Shift+Tab', 'Enter auto-indent', 'Cmd/Ctrl+Enter']
  })
}

const createToolbar = (target, pre) => {
  const toolbar = document.createElement('div')
  const identity = document.createElement('div')
  const status = document.createElement('span')
  const language = document.createElement('span')
  const shortcut = document.createElement('kbd')
  const run = document.createElement('button')
  const runIcon = document.createElement('span')
  const runLabel = document.createElement('span')

  toolbar.className = 'en-code-runner-toolbar'
  toolbar.setAttribute(TOOLBAR_ATTRIBUTE, 'true')
  toolbar.contentEditable = 'false'
  identity.className = 'en-code-runner-identity'
  status.className = 'en-code-runner-status-dot'
  language.className = 'en-code-runner-language'
  shortcut.className = 'en-code-runner-shortcut'
  shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘↵' : 'Ctrl↵'
  identity.append(status, language, shortcut)

  run.className = 'en-code-runner-run'
  run.type = 'button'
  run.setAttribute('aria-label', 'Run this code block using the configured local environment')
  runIcon.className = 'en-code-runner-run-icon'
  runIcon.textContent = '▶'
  runLabel.className = 'en-code-runner-run-label'
  runLabel.textContent = 'Run'
  run.append(runIcon, runLabel)
  run.addEventListener('mousedown', (event) => event.preventDefault())
  run.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const currentPre = toolbar.__elephantPre
    if (currentPre) void runBlock(target, currentPre, run)
  })
  toolbar.append(identity, run)
  toolbar.__elephantPre = pre
  pre.insertAdjacentElement('afterend', toolbar)
  return toolbar
}

const enhanceCodeBlock = (target, pre) => {
  if (!(pre instanceof HTMLElement)) return false
  if (!pre.querySelector('code')) return false
  if (pre.closest?.(`[${OUTPUT_ATTRIBUTE}]`)) return false

  let toolbar = toolbarFor(pre)
  const nestedToolbar = pre.querySelector(':scope > .en-code-runner-toolbar')
  if (!toolbar && nestedToolbar) {
    pre.insertAdjacentElement('afterend', nestedToolbar)
    toolbar = nestedToolbar
  }
  if (!toolbar) toolbar = createToolbar(target, pre)
  toolbar.__elephantPre = pre

  const blockId = blockIdFor(pre, toolbar)
  pre.setAttribute(ENHANCED_ATTRIBUTE, 'true')
  const language = toolbar.querySelector('.en-code-runner-language')
  const run = toolbar.querySelector('.en-code-runner-run')
  installCodeEditing(target, pre, run)

  if (blockObservers.has(pre)) return false

  let refreshScheduled = false
  let previousLanguage = null
  const refreshLanguage = (reason = 'initial') => {
    const value = languageFromBlock(pre)
    const label = value || 'No language'
    const disabled = !value
    const changed = applyLanguageUiState({
      languageElement: language,
      runButton: run,
      label,
      disabled,
      running: runningBlocks.has(pre)
    })
    toolbar.classList.toggle('has-language', Boolean(value))
    if (value !== previousLanguage) {
      logCode('info', 'language:changed', {
        blockId,
        reason,
        previousLanguage,
        language: value,
        source: describeElement(findLanguageInput(pre))
      })
      previousLanguage = value
    } else if (changed) {
      logCode('debug', 'language:ui-refreshed', { blockId, reason, language: value })
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

  refreshLanguage('initial')

  const observer = new MutationObserver((records) => {
    const relevant = relevantLanguageMutations(records, toolbar)
    if (relevant.length === 0) return
    logCode('debug', 'observer:language-source-mutation', {
      blockId,
      records: relevant.length,
      types: [...new Set(relevant.map((record) => record.type))]
    })
    scheduleRefresh('mutation')
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
    blockId,
    language: languageFromBlock(pre),
    toolbarPlacement: 'sibling-after-pre',
    pre: describeElement(pre),
    code: describeElement(pre.querySelector('code')),
    languageInput: describeElement(languageInput)
  })
  return true
}

const cleanupOrphanToolbars = () => {
  document.querySelectorAll(`[${TOOLBAR_ATTRIBUTE}]`).forEach((toolbar) => {
    const pre = toolbar.previousElementSibling
    if (!pre?.matches?.('pre')) {
      toolbar.remove()
      logCode('debug', 'toolbar:orphan-removed', {
        blockId: toolbar.dataset.elephantCodeBlockId || ''
      })
    }
  })
}

const enhanceVisibleCodeBlocks = (target) => {
  cleanupOrphanToolbars()
  const blocks = document.querySelectorAll('.en-editor-host pre, .muya-container pre, .ag-editor pre')
  let enhanced = 0
  blocks.forEach((pre) => {
    if (pre.closest?.(`[${OUTPUT_ATTRIBUTE}]`)) return
    if (enhanceCodeBlock(target, pre)) enhanced += 1
  })
  if (enhanced > 0) {
    logCode('info', 'scan:blocks-enhanced', { discovered: blocks.length, enhanced })
  }
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
  logCode('info', 'settings:save:complete', {
    reason,
    executionEnabled: state.executionEnabled === true,
    outputLineLimit: state.outputLineLimit,
    environments: state.environments?.length || 0
  })
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
      logCode('error', 'settings:save:error', { reason: 'global-toggle', error: errorMessage(error) })
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
      logCode('error', 'settings:save:error', { reason: 'output-line-limit', error: errorMessage(error) })
    }
  })
  outputRow.append(
    createSettingsCopy(
      'Retained output',
      'Keep only the last lines from stdout and stderr. The output panel scrolls like a notebook cell.'
    ),
    outputSelect
  )
  host.append(outputRow)

  const warning = document.createElement('div')
  warning.className = 'en-code-settings-note'
  warning.textContent = 'Code runs with your normal user permissions. Only execute code you trust; this is not a container or sandbox.'
  host.append(warning)

  const heading = document.createElement('div')
  heading.className = 'en-code-settings-subheading'
  const headingTitle = document.createElement('strong')
  const headingMeta = document.createElement('span')
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
        logCode('error', 'settings:save:error', {
          reason: `environment-toggle:${environment.id}`,
          error: errorMessage(error)
        })
      }
    })

    row.className = 'en-settings-row en-code-environment-row'
    controls.className = 'en-code-environment-controls'
    status.className = `en-status-badge${environment.available ? ' active' : ''}`
    status.textContent = environment.available ? 'Available' : 'Not detected'
    status.title = environment.executable || ''
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
        logCode('error', 'settings:save:error', {
          reason: `executable:${environment.id}`,
          error: errorMessage(error)
        })
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
    vueScopeAttributes: vueScopeAttributes(scopeSource),
    environments: (state.environments || []).map((environment) => ({
      id: environment.id,
      available: environment.available,
      enabled: environment.enabled !== false,
      executable: environment.executable || ''
    }))
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
  logCode('info', 'settings:detect:start', {})

  try {
    const state = await invokePrograms(target, 'list')
    state.outputLineLimit = normalizeOutputLineLimit(state.outputLineLimit, DEFAULT_OUTPUT_LINE_LIMIT)
    logCode('info', 'settings:detect:complete', {
      executionEnabled: state.executionEnabled === true,
      outputLineLimit: state.outputLineLimit,
      environments: state.environments?.length || 0
    })
    renderEnvironmentSettings(target, host, state, marker)
  } catch (error) {
    host.innerHTML = ''
    const message = document.createElement('p')
    message.className = 'en-code-settings-error'
    message.textContent = errorMessage(error)
    host.append(message)
    applyVueScope(host, marker)
    logCode('error', 'settings:detect:error', { error: errorMessage(error) })
  }
}

const enhanceSettings = (target) => {
  const content = document.querySelector('.en-settings-content')
  if (!content) return
  void installSettingsPanel(target, content)
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  if (target.__ELEPHANT_EXECUTABLE_CODE_BLOCKS_INSTALLED__) {
    logCode('debug', 'install:skipped-already-installed', {})
    return
  }
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
      logCode('error', 'scan:error', { reason, durationMs: elapsedMs(started), error: errorMessage(error) })
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
  } else {
    scheduleScan('install')
  }

  const root = document.documentElement || document.body
  if (root) {
    const nodeNeedsScan = (node) => {
      if (node?.nodeType !== 1) return false
      if (node.matches?.('.en-code-runner-toolbar, [data-elephant-code-output], [data-elephant-code-settings]')) return false
      return Boolean(
        node.matches?.('pre, .en-settings-content') ||
        node.querySelector?.('pre, .en-settings-content')
      )
    }
    const observer = new MutationObserver((records) => {
      const hasRelevantMutation = records.some((record) =>
        [...record.addedNodes].some(nodeNeedsScan)
      )
      if (hasRelevantMutation) scheduleScan('document-mutation')
    })
    observer.observe(root, { subtree: true, childList: true })
    target.addEventListener?.('beforeunload', () => observer.disconnect(), { once: true })
  } else {
    logCode('warn', 'install:no-document-root', {})
  }

  logCode('info', 'install:complete', {
    watchdogMs: RUN_WATCHDOG_MS,
    outputLineLimit: runtimeSettings.outputLineLimit,
    selectors: ['.en-editor-host pre', '.muya-container pre', '.ag-editor pre']
  })
}

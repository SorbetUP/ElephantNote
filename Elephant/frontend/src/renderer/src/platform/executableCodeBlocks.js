import './executableCodeBlocks.css'
import { applyLanguageUiState, relevantLanguageMutations } from './executableCodeBlockObserver'

const ENHANCED_ATTRIBUTE = 'data-elephant-code-runner'
const OUTPUT_ATTRIBUTE = 'data-elephant-code-output'
const SETTINGS_ATTRIBUTE = 'data-elephant-code-settings'
const LANGUAGE_CLASS_PREFIXES = ['language-', 'lang-']
const RUN_WATCHDOG_MS = 20_000
const IPC_WATCHDOG_MS = 10_000
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
const blockIdFor = (pre) => {
  if (!pre.dataset.elephantCodeBlockId) {
    pre.dataset.elephantCodeBlockId = `block-${++blockSequence}`
  }
  return pre.dataset.elephantCodeBlockId
}

const getInvoke = (target = globalThis) => target?.__TAURI__?.core?.invoke

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
    logCode('info', 'invoke:complete', {
      requestId,
      action,
      language,
      durationMs: elapsedMs(started),
      success: result?.success,
      exitCode: result?.exitCode,
      timedOut: result?.timedOut,
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
  const clone = pre.cloneNode(true)
  clone.querySelectorAll('.en-code-runner-toolbar, .en-code-runner-status').forEach((node) => node.remove())
  return clone.innerText.replace(/\u00a0/g, ' ')
}

const outputFor = (pre) => {
  const next = pre.nextElementSibling
  if (next?.hasAttribute(OUTPUT_ATTRIBUTE)) return next
  const output = document.createElement('section')
  output.setAttribute(OUTPUT_ATTRIBUTE, 'true')
  output.className = 'en-code-output'
  output.hidden = true
  output.contentEditable = 'false'
  pre.insertAdjacentElement('afterend', output)
  logCode('debug', 'output:created', { blockId: blockIdFor(pre) })
  return output
}

const renderOutput = (pre, state, result = {}) => {
  const blockId = blockIdFor(pre)
  const output = outputFor(pre)
  output.hidden = false
  output.replaceChildren()

  const header = document.createElement('header')
  const title = document.createElement('strong')
  const meta = document.createElement('span')
  const clear = document.createElement('button')
  title.textContent = state === 'running' ? 'Running…' : result.success ? 'Output' : 'Execution failed'
  meta.textContent =
    state === 'running'
      ? ''
      : [
          result.environment || result.language || '',
          Number.isFinite(Number(result.durationMs)) ? `${result.durationMs} ms` : '',
          result.exitCode !== null && result.exitCode !== undefined ? `exit ${result.exitCode}` : '',
          result.timedOut ? 'timed out' : '',
          result.truncated ? 'truncated' : ''
        ]
          .filter(Boolean)
          .join(' · ')
  clear.type = 'button'
  clear.textContent = 'Clear'
  clear.addEventListener('click', () => {
    output.hidden = true
    output.replaceChildren()
    logCode('info', 'output:cleared', { blockId })
  })
  header.append(title, meta, clear)
  output.append(header)

  if (state === 'running') {
    const progress = document.createElement('div')
    progress.className = 'en-code-output-progress'
    progress.setAttribute('aria-label', 'Code execution in progress')
    output.append(progress)
    logCode('info', 'output:running', { blockId })
    return
  }

  const appendStream = (label, value, className) => {
    if (!value) return
    const stream = document.createElement('div')
    const streamLabel = document.createElement('small')
    const text = document.createElement('pre')
    stream.className = className
    streamLabel.textContent = label
    text.textContent = value
    stream.append(streamLabel, text)
    output.append(stream)
  }
  appendStream('stdout', result.stdout, 'en-code-output-stdout')
  appendStream('stderr', result.stderr || result.error, 'en-code-output-stderr')
  if (!result.stdout && !result.stderr && !result.error) {
    const empty = document.createElement('p')
    empty.textContent = 'The program completed without producing output.'
    output.append(empty)
  }

  logCode(result.success ? 'info' : 'warn', 'output:rendered', {
    blockId,
    success: result.success === true,
    language: result.language || '',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut === true,
    truncated: result.truncated === true,
    stdoutBytes: byteLength(result.stdout || ''),
    stderrBytes: byteLength(result.stderr || result.error || '')
  })
}

const runBlock = async(target, pre, button) => {
  const blockId = blockIdFor(pre)
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
  button.dataset.previousLabel = button.textContent
  button.textContent = 'Running…'
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
      truncated: result?.truncated
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
      error: errorMessage(error)
    })
  } finally {
    runningBlocks.delete(pre)
    button.disabled = false
    button.textContent = button.dataset.previousLabel || 'Run'
    logCode('info', 'run:finished', { blockId, language, durationMs: elapsedMs(started) })
  }
}

const enhanceCodeBlock = (target, pre) => {
  if (!(pre instanceof HTMLElement)) return false
  if (!pre.querySelector('code')) return false
  if (pre.hasAttribute(ENHANCED_ATTRIBUTE) && pre.querySelector('.en-code-runner-toolbar')) return false

  const blockId = blockIdFor(pre)
  pre.setAttribute(ENHANCED_ATTRIBUTE, 'true')

  const toolbar = document.createElement('div')
  const language = document.createElement('span')
  const run = document.createElement('button')
  toolbar.className = 'en-code-runner-toolbar'
  toolbar.contentEditable = 'false'
  language.className = 'en-code-runner-language'
  run.className = 'en-code-runner-run'
  run.type = 'button'
  run.textContent = 'Run'
  run.title = 'Run this code block using the configured local environment'
  run.addEventListener('mousedown', (event) => event.preventDefault())
  run.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void runBlock(target, pre, run)
  })
  toolbar.append(language, run)
  pre.append(toolbar)

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
    if (relevant.length === 0) {
      logCode('debug', 'observer:ignored-toolbar-mutation', { blockId, records: records.length })
      return
    }
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
    pre: describeElement(pre),
    code: describeElement(pre.querySelector('code')),
    languageInput: describeElement(languageInput)
  })
  return true
}

const enhanceVisibleCodeBlocks = (target) => {
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
  logCode('info', 'settings:save:start', { reason, executionEnabled: state.executionEnabled === true })
  const next = await invokePrograms(target, 'set', configFromState(state))
  Object.assign(state, next)
  logCode('info', 'settings:save:complete', {
    reason,
    executionEnabled: state.executionEnabled === true,
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

const renderEnvironmentSettings = (target, host, state) => {
  host.replaceChildren()
  host.setAttribute(SETTINGS_ATTRIBUTE, 'true')
  host.className = 'en-settings-group en-code-settings-group en-code-settings'

  const heading = document.createElement('div')
  heading.className = 'en-code-settings-heading'
  const copy = document.createElement('div')
  const title = document.createElement('strong')
  const description = document.createElement('span')
  title.textContent = 'Code execution'
  description.textContent = 'Run fenced code blocks locally. The working directory is the active vault, but code keeps your normal user permissions.'
  copy.append(title, description)
  const globalSwitch = createSwitch(state.executionEnabled === true, 'Enable code execution', async() => {
    globalSwitch.disabled = true
    state.executionEnabled = !state.executionEnabled
    try {
      await saveSettings(target, state, 'global-toggle')
      renderEnvironmentSettings(target, host, state)
    } catch (error) {
      state.executionEnabled = !state.executionEnabled
      globalSwitch.disabled = false
      globalSwitch.title = errorMessage(error)
      logCode('error', 'settings:save:error', { reason: 'global-toggle', error: errorMessage(error) })
    }
  })
  heading.append(copy, globalSwitch)
  host.append(heading)

  const warning = document.createElement('p')
  warning.className = 'en-code-settings-warning'
  warning.textContent = 'Only run code you trust. ElephantNote does not use a container or sandbox in this first implementation.'
  host.append(warning)

  const list = document.createElement('div')
  list.className = 'en-code-environment-list'
  for (const environment of state.environments || []) {
    const row = document.createElement('article')
    const identity = document.createElement('div')
    const label = document.createElement('strong')
    const status = document.createElement('span')
    const executable = document.createElement('input')
    const toggle = createSwitch(environment.enabled !== false, `Enable ${environment.label}`, async() => {
      toggle.disabled = true
      environment.enabled = !environment.enabled
      try {
        await saveSettings(target, state, `environment-toggle:${environment.id}`)
        renderEnvironmentSettings(target, host, state)
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
    label.textContent = environment.label
    status.textContent = environment.available
      ? [environment.version, environment.executable].filter(Boolean).join(' · ')
      : 'Not detected'
    identity.append(label, status)
    executable.type = 'text'
    executable.value = environment.configuredExecutable || ''
    executable.placeholder = environment.executable || 'Executable name or absolute path'
    executable.setAttribute('aria-label', `${environment.label} executable`)
    executable.addEventListener('change', async() => {
      environment.configuredExecutable = executable.value.trim()
      executable.disabled = true
      try {
        await saveSettings(target, state, `executable:${environment.id}`)
        renderEnvironmentSettings(target, host, state)
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
    row.append(identity, executable, toggle)
    list.append(row)
  }
  host.append(list)

  logCode('info', 'settings:rendered', {
    executionEnabled: state.executionEnabled === true,
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
  const marker = [...editorSettingsRoot.querySelectorAll('.en-settings-row-copy strong')]
    .find((node) => node.textContent.trim() === 'Code block line numbers')
    ?.closest('.en-settings-row')
  if (!marker) return

  const host = document.createElement('section')
  host.className = 'en-settings-group en-code-settings-group'
  marker.closest('.en-settings-group')?.insertAdjacentElement('afterend', host)
  host.innerHTML = '<p class="en-code-settings-loading">Detecting local environments…</p>'
  logCode('info', 'settings:detect:start', {})

  try {
    const state = await invokePrograms(target, 'list')
    logCode('info', 'settings:detect:complete', {
      executionEnabled: state.executionEnabled === true,
      environments: state.environments?.length || 0
    })
    renderEnvironmentSettings(target, host, state)
  } catch (error) {
    host.innerHTML = ''
    const message = document.createElement('p')
    message.className = 'en-code-settings-error'
    message.textContent = errorMessage(error)
    host.append(message)
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
    const observer = new MutationObserver((records) => {
      const hasRelevantMutation = records.some((record) => {
        const targetElement = record.target?.nodeType === 1 ? record.target : record.target?.parentElement
        return !targetElement?.closest?.('.en-code-runner-toolbar, [data-elephant-code-output]')
      })
      if (hasRelevantMutation) scheduleScan('document-mutation')
    })
    observer.observe(root, { subtree: true, childList: true })
    target.addEventListener?.('beforeunload', () => observer.disconnect(), { once: true })
  } else {
    logCode('warn', 'install:no-document-root', {})
  }

  logCode('info', 'install:complete', {
    watchdogMs: RUN_WATCHDOG_MS,
    selectors: ['.en-editor-host pre', '.muya-container pre', '.ag-editor pre']
  })
}

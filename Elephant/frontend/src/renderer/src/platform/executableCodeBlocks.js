import './executableCodeBlocks.css'

const ENHANCED_ATTRIBUTE = 'data-elephant-code-runner'
const OUTPUT_ATTRIBUTE = 'data-elephant-code-output'
const SETTINGS_ATTRIBUTE = 'data-elephant-code-settings'
const LANGUAGE_CLASS_PREFIXES = ['language-', 'lang-']

const getInvoke = (target = globalThis) => target?.__TAURI__?.core?.invoke

const invokePrograms = (target, action, payload = {}) => {
  const invoke = getInvoke(target)
  if (typeof invoke !== 'function') {
    throw new Error('The Tauri command API is unavailable for code execution.')
  }
  if (action === 'list') return invoke('tauri_programs_list')
  if (action === 'set') return invoke('tauri_programs_set', { environments: payload })
  if (action === 'run') {
    return invoke('tauri_programs_run', {
      id: String(payload.id || ''),
      command: String(payload.command ?? payload.code ?? ''),
      cwd: payload.cwd || null
    })
  }
  throw new Error(`Unsupported programs action: ${action}`)
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

  const languageInput = pre.querySelector(
    '.ag-language-input, .language-input, [data-function-type="languageInput"], [functiontype="languageInput"], [data-role="language-input"]'
  )
  return normalizeLanguage(languageInput?.textContent || '')
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
  return output
}

const renderOutput = (pre, state, result = {}) => {
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
          result.truncated ? 'truncated' : ''
        ]
          .filter(Boolean)
          .join(' · ')
  clear.type = 'button'
  clear.textContent = 'Clear'
  clear.addEventListener('click', () => {
    output.hidden = true
    output.replaceChildren()
  })
  header.append(title, meta, clear)
  output.append(header)

  if (state === 'running') {
    const progress = document.createElement('div')
    progress.className = 'en-code-output-progress'
    progress.setAttribute('aria-label', 'Code execution in progress')
    output.append(progress)
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
}

const runBlock = async(target, pre, button) => {
  const language = languageFromBlock(pre)
  if (!language) {
    renderOutput(pre, 'done', {
      success: false,
      error: 'Choose a language for this fenced code block before running it.'
    })
    return
  }
  const code = codeFromBlock(pre)
  button.disabled = true
  button.dataset.previousLabel = button.textContent
  button.textContent = 'Running…'
  renderOutput(pre, 'running')
  try {
    const result = await invokePrograms(target, 'run', { id: language, command: code })
    renderOutput(pre, 'done', result)
  } catch (error) {
    renderOutput(pre, 'done', {
      success: false,
      language,
      error: error?.message || String(error)
    })
  } finally {
    button.disabled = false
    button.textContent = button.dataset.previousLabel || 'Run'
  }
}

const enhanceCodeBlock = (target, pre) => {
  if (!(pre instanceof HTMLElement) || pre.hasAttribute(ENHANCED_ATTRIBUTE)) return
  if (!pre.querySelector('code')) return
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

  const refreshLanguage = () => {
    const value = languageFromBlock(pre)
    language.textContent = value || 'No language'
    run.disabled = !value
  }
  refreshLanguage()

  const observer = new MutationObserver(refreshLanguage)
  observer.observe(pre, { subtree: true, childList: true, characterData: true, attributes: true })
}

const enhanceVisibleCodeBlocks = (target) => {
  document
    .querySelectorAll('.en-editor-host pre, .muya-container pre, .ag-editor pre')
    .forEach((pre) => enhanceCodeBlock(target, pre))
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

const saveSettings = async(target, state) => {
  const next = await invokePrograms(target, 'set', configFromState(state))
  Object.assign(state, next)
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
  host.className = 'en-code-settings'

  const heading = document.createElement('div')
  heading.className = 'en-code-settings-heading'
  const copy = document.createElement('div')
  const title = document.createElement('strong')
  const description = document.createElement('span')
  title.textContent = 'Code execution'
  description.textContent = 'Run fenced code blocks locally. Programs execute with your user permissions inside the active vault.'
  copy.append(title, description)
  const globalSwitch = createSwitch(state.executionEnabled === true, 'Enable code execution', async() => {
    globalSwitch.disabled = true
    state.executionEnabled = !state.executionEnabled
    try {
      await saveSettings(target, state)
      renderEnvironmentSettings(target, host, state)
    } catch (error) {
      state.executionEnabled = !state.executionEnabled
      globalSwitch.disabled = false
      globalSwitch.title = error?.message || String(error)
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
        await saveSettings(target, state)
        renderEnvironmentSettings(target, host, state)
      } catch (error) {
        environment.enabled = !environment.enabled
        toggle.disabled = false
        toggle.title = error?.message || String(error)
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
        await saveSettings(target, state)
        renderEnvironmentSettings(target, host, state)
      } catch (error) {
        executable.disabled = false
        executable.setCustomValidity(error?.message || String(error))
        executable.reportValidity()
      }
    })
    row.append(identity, executable, toggle)
    list.append(row)
  }
  host.append(list)
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
  try {
    const state = await invokePrograms(target, 'list')
    renderEnvironmentSettings(target, host, state)
  } catch (error) {
    host.innerHTML = ''
    const message = document.createElement('p')
    message.className = 'en-code-settings-error'
    message.textContent = error?.message || String(error)
    host.append(message)
  }
}

const enhanceSettings = (target) => {
  const content = document.querySelector('.en-settings-content')
  if (!content) return
  const editorRows = [...content.querySelectorAll('.en-settings-row-copy strong')]
  if (!editorRows.some((node) => node.textContent.trim() === 'Code block line numbers')) return
  void installSettingsPanel(target, content)
}

export const installExecutableCodeBlocks = (target = globalThis) => {
  if (!target?.document || !target?.__TAURI__) return false
  if (target.__ELEPHANT_EXECUTABLE_CODE_BLOCKS_INSTALLED__) return true
  target.__ELEPHANT_EXECUTABLE_CODE_BLOCKS_INSTALLED__ = true
  installProgramsApi(target)

  const observer = new MutationObserver(() => {
    enhanceVisibleCodeBlocks(target)
    enhanceSettings(target)
  })
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true })
    enhanceVisibleCodeBlocks(target)
    enhanceSettings(target)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  return true
}

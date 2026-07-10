import './executableCodeSettings.css'

const SETTINGS_HOST = '.en-settings-content'
const SETTINGS_MARKER = 'data-elephant-code-settings'
const DEFAULT_OUTPUT_LINES = 200
const OUTPUT_LINE_LIMITS = [10, 20, 50, 100, 200, 500, 1000, 5000]

const make = (tag, className = '', text = '') => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const message = (error) => error?.message || String(error || 'Unknown error')
const normalizeOutputLineLimit = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_OUTPUT_LINES
  return Math.min(5000, Math.max(10, parsed))
}

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

const configFromState = (state) => ({
  executionEnabled: state.executionEnabled === true,
  outputLineLimit: normalizeOutputLineLimit(state.outputLineLimit),
  environments: Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
    enabled: environment.enabled !== false,
    executable: environment.configuredExecutable || ''
  }]))
})

const save = async(target, state) => {
  const result = await target.elephantnote.programs.set({ environments: configFromState(state) })
  Object.assign(state, result)
}

const renderSettings = (target, host, state) => {
  host.replaceChildren(make('div', 'en-code-settings-title', 'Code execution'))

  const enabledRow = make('div', 'en-settings-row')
  const enabledToggle = toggle(state.executionEnabled, 'Enable code execution', async() => {
    state.executionEnabled = !state.executionEnabled
    try {
      await save(target, state)
      renderSettings(target, host, state)
    } catch (error) {
      enabledToggle.title = message(error)
    }
  })
  enabledRow.append(
    rowCopy('Code execution', 'Run trusted fenced blocks with local interpreters.'),
    enabledToggle
  )
  host.append(enabledRow)

  const outputRow = make('div', 'en-settings-row')
  const outputSelect = make('select', 'en-compact-select')
  for (const value of OUTPUT_LINE_LIMITS) {
    const option = make('option', '', value === 5000 ? '5,000 lines' : `${value} lines`)
    option.value = String(value)
    option.selected = normalizeOutputLineLimit(state.outputLineLimit) === value
    outputSelect.append(option)
  }
  outputSelect.addEventListener('change', async() => {
    state.outputLineLimit = normalizeOutputLineLimit(outputSelect.value)
    try {
      await save(target, state)
      renderSettings(target, host, state)
    } catch (error) {
      outputSelect.title = message(error)
    }
  })
  outputRow.append(
    rowCopy('Retained output', 'Keep only the final stdout and stderr lines.'),
    outputSelect
  )
  host.append(
    outputRow,
    make('div', 'en-code-settings-note', 'Code runs with your normal user permissions. It is not sandboxed.')
  )

  for (const environment of state.environments || []) {
    const row = make('div', 'en-settings-row en-code-environment-row')
    const controls = make('div', 'en-code-environment-controls')
    const status = make(
      'span',
      `en-status-badge${environment.available ? ' active' : ''}`,
      environment.available ? 'Available' : 'Not detected'
    )
    const executable = make('input', 'en-compact-input en-code-executable-input')
    executable.value = environment.configuredExecutable || ''
    executable.placeholder = environment.executable || 'Executable path'
    executable.addEventListener('change', async() => {
      environment.configuredExecutable = executable.value.trim()
      try {
        await save(target, state)
        renderSettings(target, host, state)
      } catch (error) {
        executable.title = message(error)
      }
    })
    const environmentToggle = toggle(environment.enabled !== false, `Enable ${environment.label}`, async() => {
      environment.enabled = !environment.enabled
      try {
        await save(target, state)
        renderSettings(target, host, state)
      } catch (error) {
        environmentToggle.title = message(error)
      }
    })
    controls.append(status, executable, environmentToggle)
    row.append(
      rowCopy(
        environment.label,
        environment.available
          ? [
              environment.version,
              environment.configuredExecutable ? 'Custom executable' : 'Auto-detected'
            ].filter(Boolean).join(' · ')
          : 'Install the runtime or enter an executable path.'
      ),
      controls
    )
    host.append(row)
  }
}

const activeSettingsSection = (content) => {
  const explicit = content?.dataset?.activeSection?.trim().toLowerCase()
  if (explicit) return explicit
  const title = content?.querySelector?.('.en-settings-page-title h1')?.textContent?.trim().toLowerCase()
  if (title) return title
  return document.querySelector('.en-settings-nav button.active span')?.textContent?.trim().toLowerCase() || ''
}

const removeMountedSettings = (content = document.querySelector(SETTINGS_HOST)) => {
  content?.querySelector?.(`[${SETTINGS_MARKER}]`)?.remove()
}

export const installExecutableCodeSettings = (target = globalThis) => {
  if (target.__ELEPHANT_CODE_SETTINGS__) return target.__ELEPHANT_CODE_SETTINGS__

  let loading = false
  let disposed = false

  const mount = async() => {
    if (disposed || loading) return
    const content = document.querySelector(SETTINGS_HOST)
    if (!content) return

    if (activeSettingsSection(content) !== 'editor') {
      removeMountedSettings(content)
      return
    }

    if (content.querySelector(`[${SETTINGS_MARKER}]`)) return
    const marker = content.querySelector('.en-settings-group')
    if (!marker || !target.elephantnote?.programs) return

    loading = true
    const host = make('section', 'en-settings-group en-code-settings-group')
    host.setAttribute(SETTINGS_MARKER, 'true')
    host.append(make('p', 'en-code-settings-loading', 'Detecting local environments…'))
    marker.insertAdjacentElement('afterend', host)
    try {
      const state = await target.elephantnote.programs.list()
      state.outputLineLimit = normalizeOutputLineLimit(state.outputLineLimit)
      renderSettings(target, host, state)
    } catch (error) {
      host.replaceChildren(make('p', 'en-code-settings-error', message(error)))
    } finally {
      loading = false
    }
  }

  const observer = new MutationObserver(() => {
    void mount()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  void mount()

  const settings = {
    mount,
    dispose() {
      disposed = true
      observer.disconnect()
      removeMountedSettings()
      if (target.__ELEPHANT_CODE_SETTINGS__ === settings) {
        delete target.__ELEPHANT_CODE_SETTINGS__
      }
    }
  }
  target.__ELEPHANT_CODE_SETTINGS__ = settings
  return settings
}

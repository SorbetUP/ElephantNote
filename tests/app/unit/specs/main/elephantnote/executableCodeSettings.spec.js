// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeSettings } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeSettings'

const flush = async() => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const editorSettingsMarkup = () => `
  <section class="en-settings-content" data-active-section="editor">
    <div class="en-settings-page-title"><h1>Editor</h1></div>
    <div class="en-settings-group"></div>
  </section>
`

const settingsState = () => ({
  executionEnabled: true,
  outputLineLimit: 200,
  environments: [
    {
      id: 'python',
      label: 'Python',
      enabled: true,
      available: true,
      executable: '/usr/bin/python3',
      configuredExecutable: '',
      version: 'Python 3.12'
    },
    {
      id: 'node',
      label: 'JavaScript',
      enabled: false,
      available: false,
      executable: '',
      configuredExecutable: '',
      version: ''
    }
  ]
})

const hydratedSettingsState = (configuration) => {
  const current = settingsState()
  return {
    ...current,
    executionEnabled: configuration.executionEnabled,
    outputLineLimit: configuration.outputLineLimit,
    environments: current.environments.map((environment) => ({
      ...environment,
      enabled: configuration.environments[environment.id]?.enabled ?? environment.enabled,
      configuredExecutable: configuration.environments[environment.id]?.executable ?? ''
    }))
  }
}

describe('isolated executable code settings', () => {
  let list
  let set

  beforeEach(() => {
    globalThis.__ELEPHANT_CODE_SETTINGS__?.dispose?.()
    document.body.innerHTML = ''
    list = vi.fn(async() => settingsState())
    set = vi.fn(async({ environments }) => hydratedSettingsState(environments))
    globalThis.elephantnote = { programs: { list, set } }
  })

  afterEach(() => {
    globalThis.__ELEPHANT_CODE_SETTINGS__?.dispose?.()
    delete globalThis.elephantnote
    document.body.innerHTML = ''
  })

  it('mounts only in Editor settings and lists detected environments', async() => {
    document.body.innerHTML = `
      <main class="en-editor-host"><pre class="ag-fence-code"><code>print(1)</code></pre></main>
      ${editorSettingsMarkup()}
    `

    installExecutableCodeSettings(globalThis)
    await flush()

    const group = document.querySelector('[data-elephant-code-settings]')
    expect(group).not.toBeNull()
    expect(group.textContent).toContain('Code execution')
    expect(group.textContent).toContain('Python')
    expect(group.textContent).toContain('JavaScript')
    expect(list).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.en-editor-host [data-elephant-code-settings]')).toBeNull()
    expect(document.querySelector('pre').children).toHaveLength(1)
  })

  it('does not mount in non-editor settings categories', async() => {
    document.body.innerHTML = `
      <section class="en-settings-content" data-active-section="addons">
        <div class="en-settings-page-title"><h1>Addons</h1></div>
        <div class="en-settings-group"></div>
      </section>
    `

    installExecutableCodeSettings(globalThis)
    await flush()

    expect(document.querySelector('[data-elephant-code-settings]')).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })

  it('reacts when the Editor settings page is mounted later', async() => {
    installExecutableCodeSettings(globalThis)
    const wrapper = document.createElement('div')
    wrapper.innerHTML = editorSettingsMarkup()
    document.body.append(wrapper.firstElementChild)
    await flush()

    const content = document.querySelector('.en-settings-content')
    expect(content.querySelector('[data-elephant-code-settings]')).not.toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('persists one normalized settings payload', async() => {
    document.body.innerHTML = editorSettingsMarkup()
    installExecutableCodeSettings(globalThis)
    await flush()

    const outputSelect = document.querySelector('.en-code-settings-group select')
    outputSelect.value = '500'
    outputSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({
      environments: expect.objectContaining({
        executionEnabled: true,
        outputLineLimit: 500,
        environments: expect.objectContaining({
          python: expect.objectContaining({ enabled: true }),
          node: expect.objectContaining({ enabled: false })
        })
      })
    })
    expect(document.querySelector('.en-code-settings-group').textContent).toContain('Python')
  })

  it('removes code controls when the active category changes', async() => {
    document.body.innerHTML = editorSettingsMarkup()
    const settings = installExecutableCodeSettings(globalThis)
    await flush()
    expect(document.querySelector('[data-elephant-code-settings]')).not.toBeNull()

    const content = document.querySelector('.en-settings-content')
    content.dataset.activeSection = 'appearance'
    content.querySelector('h1').textContent = 'Appearance'
    await settings.mount()

    expect(document.querySelector('[data-elephant-code-settings]')).toBeNull()
  })

  it('disconnects its observer without touching the editor runtime', async() => {
    const settings = installExecutableCodeSettings(globalThis)
    settings.dispose()

    const wrapper = document.createElement('div')
    wrapper.innerHTML = editorSettingsMarkup()
    document.body.append(wrapper.firstElementChild)
    await flush()

    const content = document.querySelector('.en-settings-content')
    expect(content.querySelector('[data-elephant-code-settings]')).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
})

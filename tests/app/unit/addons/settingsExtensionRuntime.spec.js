import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { installSettingsContributionRuntime } from '../../../../Elephant/frontend/src/renderer/src/addons/settingsContributionRuntime.js'
import { installExecutableCodeSettings } from '../../../../Elephant/frontend/src/renderer/src/platform/executableCodeSettings.js'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const mountSettingsPage = (section) => {
  document.body.innerHTML = `
    <main class="en-settings-content" data-active-section="${section}">
      <div class="en-settings-page-title"><h1>${section[0].toUpperCase()}${section.slice(1)}</h1></div>
      <section class="en-settings-group" data-native-settings="true"></section>
    </main>
  `
  return document.querySelector('.en-settings-content')
}

afterEach(() => {
  globalThis.__ELEPHANT_CODE_SETTINGS__?.dispose?.()
  delete globalThis.__ELEPHANT_CODE_SETTINGS__
  delete globalThis.elephantnote
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('code execution settings scope', () => {
  it('mounts only in Editor and removes itself when another section becomes active', async () => {
    const content = mountSettingsPage('appearance')
    globalThis.elephantnote = {
      programs: {
        list: vi.fn(async () => ({
          executionEnabled: false,
          outputLineLimit: 200,
          environments: []
        })),
        set: vi.fn()
      }
    }

    const runtime = installExecutableCodeSettings(globalThis)
    await runtime.mount()
    expect(content.querySelector('[data-elephant-code-settings]')).toBeNull()
    expect(globalThis.elephantnote.programs.list).not.toHaveBeenCalled()

    content.dataset.activeSection = 'editor'
    content.querySelector('h1').textContent = 'Editor'
    await runtime.mount()
    await flush()

    expect(content.querySelector('[data-elephant-code-settings]')).not.toBeNull()
    expect(content.textContent).toContain('Code execution')
    expect(globalThis.elephantnote.programs.list).toHaveBeenCalledTimes(1)

    content.dataset.activeSection = 'vaults'
    content.querySelector('h1').textContent = 'Vaults'
    await runtime.mount()

    expect(content.querySelector('[data-elephant-code-settings]')).toBeNull()
  })
})

describe('addon settings contribution runtime', () => {
  it('renders a contribution only in its target section and removes it on disable', async () => {
    const content = mountSettingsPage('appearance')
    const cleanup = vi.fn()
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    manager.host = { list: () => ['router', 'services'] }
    manager.register({
      manifest: {
        id: 'com.example.settings',
        name: 'Settings extension',
        version: '1.0.0'
      },
      activate(context) {
        context.addSettingsSection({
          id: 'com.example.settings.panel',
          title: 'Addon-owned settings',
          description: 'Rendered in the real Addons category.',
          section: 'addons',
          render(container) {
            const marker = document.createElement('button')
            marker.type = 'button'
            marker.textContent = 'Real addon control'
            container.append(marker)
            return cleanup
          }
        })
      }
    })

    const runtime = installSettingsContributionRuntime(manager)
    await manager.enable('com.example.settings')
    await flush()

    expect(content.querySelector('[data-elephant-addon-settings-host]')).toBeNull()

    content.dataset.activeSection = 'addons'
    content.querySelector('h1').textContent = 'Addons'
    runtime.sync()
    await flush()

    const extension = content.querySelector('[data-elephant-addon-settings-host]')
    expect(extension).not.toBeNull()
    expect(extension.dataset.addonId).toBe('com.example.settings')
    expect(extension.textContent).toContain('Addon-owned settings')
    expect(extension.textContent).toContain('Real addon control')

    await manager.disable('com.example.settings')
    await flush()

    expect(content.querySelector('[data-elephant-addon-settings-host]')).toBeNull()
    expect(cleanup).toHaveBeenCalledOnce()
    runtime.dispose()
  })

  it('moves contributions when the active settings category changes', async () => {
    const content = mountSettingsPage('addons')
    const manager = new ElephantAddonManager()
    manager.register({
      manifest: { id: 'com.example.editor-settings', name: 'Editor settings', version: '1.0.0' },
      activate(context) {
        context.addSettingsSection({
          id: 'com.example.editor-settings.panel',
          title: 'Editor-only addon setting',
          section: 'editor',
          fields: [{ id: 'enabled', label: 'Enabled', type: 'boolean', value: true }]
        })
      }
    })

    const runtime = installSettingsContributionRuntime(manager)
    await manager.enable('com.example.editor-settings')
    await flush()
    expect(content.textContent).not.toContain('Editor-only addon setting')

    content.dataset.activeSection = 'editor'
    content.querySelector('h1').textContent = 'Editor'
    runtime.sync()
    await flush()
    expect(content.textContent).toContain('Editor-only addon setting')

    content.dataset.activeSection = 'sync'
    content.querySelector('h1').textContent = 'Sync'
    runtime.sync()
    await flush()
    expect(content.textContent).not.toContain('Editor-only addon setting')
    runtime.dispose()
  })
})

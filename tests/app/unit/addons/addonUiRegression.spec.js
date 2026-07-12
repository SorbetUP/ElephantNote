import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { installSettingsContributionRuntime } from '../../../../Elephant/frontend/src/renderer/src/addons/settingsContributionRuntime.js'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const mountSettingsPage = (section) => {
  document.body.innerHTML = `
    <section class="en-settings-panel" data-v-settings-test>
      <main class="en-settings-content" data-v-settings-test data-active-section="${section}">
        <div class="en-settings-page-title" data-v-settings-test><h1>${section}</h1></div>
      </main>
    </section>
  `
  return document.querySelector('.en-settings-content')
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('addon UI regression contracts', () => {
  it('keeps installed addons out of the available catalogue and exposes uninstall directly', () => {
    const settings = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const row = read('Elephant/frontend/app/components/settings/AddonSettingsRow.vue')

    expect(settings).toContain('const installedById = new Map(items.value.map')
    expect(settings).toContain('installedById.has(manifest.id)')
    expect(settings).toContain('Uninstalled ${addon.manifest.name}')
    expect(row).toContain('class="en-addon-uninstall-button"')
    expect(row).toContain('>Uninstall</button>')
  })

  it('turns an installed addon pack into an uninstall action without removing core Excalidraw or showing success chatter', () => {
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AddonPacksSettings.vue')
    const feedback = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/addonPacksFeedback.css')

    expect(packs).toContain("NON_REMOVABLE_ADDON_IDS = new Set(['elephant.addon-packs', 'elephant.excalidraw'])")
    expect(packs).toContain("isPackInstalled(pack) ? 'Uninstall'")
    expect(packs).toContain('addonsStore.manager.uninstallBuiltin(entry.id)')
    expect(packs).toContain('addonsStore.uninstallExternalAddon(entry.id)')
    expect(feedback).toContain('.en-addons-feedback:not(.error)')
    expect(feedback).toContain('display: none !important')
  })

  it('keeps addon workspaces in the icon rail rather than below All notes', () => {
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')

    expect(sidebar).not.toContain('en-addon-views')
    expect(sidebar).not.toContain('addonViews')
    expect(rail).toContain("addonsStore.getContributions('views')")
  })

  it('preserves the chat icon instead of falling back to a star', () => {
    const chat = read('Elephant/frontend/src/renderer/src/addons/builtin/aiChat.js')
    const selectors = read('Elephant/frontend/src/renderer/src/addons/contributionSelectors.js')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const railSettings = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')

    expect(chat).toContain("icon: 'message-circle'")
    expect(selectors).toContain("icon: normalizeText(entry.contribution.icon, 'star')")
    expect(rail).toContain("'message-circle': MessageCircle")
    expect(railSettings).toContain("'message-circle': MessageCircle")
  })

  it('keeps the open model library separate and removes role assignment from its catalogue UI', () => {
    const providers = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const openModels = read('Elephant/frontend/src/renderer/src/addons/builtin/openModels.js')
    const openModelsView = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/OpenModelsView.vue')
    const registry = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')

    expect(providers).not.toContain('ModelsView')
    expect(providers).not.toContain("kind: 'ai-models-v1'")
    expect(providers).not.toContain('autostartLlamaRuntime')
    expect(openModels).toContain("const ADDON_ID = 'elephant.open-models'")
    expect(openModels).toContain('component: OpenModelsView')
    expect(openModels).toContain("kind: 'open-models-v1'")
    expect(openModels).not.toContain('autostartLlamaRuntime')
    expect(openModels).toContain("ctx.registerContribution('ai.providers'")
    expect(openModelsView).toContain('.en-role-grid')
    expect(openModelsView).toContain('display: none')
    expect(registry).toContain("id: 'elephant.open-models'")
    expect(registry).toContain('openModelsAddon,')
    expect(packs).toContain("{ id: 'elephant.open-models', version: '1.1.0', source: 'builtin', enabled: true }")
  })

  it('mounts a root settings page and its nested provider slot without remounting the root', async () => {
    const content = mountSettingsPage('ai')
    const manager = new ElephantAddonManager()
    manager.host = { list: () => [] }
    const rootRender = vi.fn((container) => {
      const slot = document.createElement('div')
      slot.setAttribute('data-elephant-addon-settings-slot', 'ai.providers.after-external')
      container.append(slot)
    })
    const nestedRender = vi.fn((container) => {
      container.textContent = 'Codex account'
    })

    manager.register({
      manifest: { id: 'elephant.ai.test', name: 'AI', version: '1.0.0' },
      activate(context) {
        context.addSettingsSection({
          id: 'elephant.ai.test.settings',
          section: 'ai',
          chrome: false,
          render: rootRender
        })
      }
    })
    manager.register({
      manifest: { id: 'elephant.codex.test', name: 'Codex', version: '1.0.0' },
      activate(context) {
        context.addSettingsSection({
          id: 'elephant.codex.test.settings',
          section: 'ai',
          slot: 'ai.providers.after-external',
          chrome: false,
          render: nestedRender
        })
      }
    })

    const runtime = installSettingsContributionRuntime(manager)
    await manager.enable('elephant.ai.test')
    await manager.enable('elephant.codex.test')
    await flush()
    await flush()
    await flush()

    expect(rootRender).toHaveBeenCalledTimes(1)
    expect(nestedRender).toHaveBeenCalledTimes(1)
    expect(content.querySelectorAll('[data-elephant-addon-settings-host]')).toHaveLength(2)
    expect(content.textContent).toContain('Codex account')
    runtime.dispose()
  })
})

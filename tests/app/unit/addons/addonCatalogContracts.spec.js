import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('official addon branch catalogue', () => {
  it('shows installed addons first and all remaining addons in one list', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const logic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')

    expect(panel).toContain('<h3>Installed addons</h3>')
    expect(panel).toContain('<h3>Available addons</h3>')
    expect(panel.indexOf('<h3>Installed addons</h3>')).toBeLessThan(panel.indexOf('<h3>Available addons</h3>'))
    expect(panel).not.toContain('<h3>Core addons</h3>')
    expect(panel).not.toContain('<h3>Built-in addon catalogue</h3>')
    expect(panel).not.toContain('<h3>Installed community addons</h3>')
    expect(panel).not.toContain('<h3>Browse official community addons</h3>')
    expect(logic).toContain('const filteredInstalledAddons = computed')
    expect(logic).toContain('const availableAddons = computed')
  })

  it('keeps real install and update actions without visually separating addon sources', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const logic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const store = read('Elephant/frontend/src/renderer/src/store/addons.js')

    expect(panel).toContain('v-for="addon in visibleAvailableAddons"')
    expect(panel).toContain("addon.updateAvailable ? 'Update' : 'Install'")
    expect(panel).not.toContain('Built in by ElephantNote')
    expect(logic).toContain('await addonsStore.loadAddonCatalog()')
    expect(logic).toContain('await addonsStore.installCatalogAddon(addon.id)')
    expect(logic).toContain("addon?.installSource === 'builtin'")
    expect(store).toContain("invokeTauri('tauri_addons_catalog_list')")
    expect(store).toContain("invokeTauri('tauri_addons_catalog_install', { addonId: id })")
    expect(store).toContain('this.manager.external.register(record)')
  })

  it('locks catalogue downloads to the dedicated GitHub branch', () => {
    const rust = read('Elephant/backend/tauri/src/addon_catalog.rs')
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')

    expect(rust).toContain('https://raw.githubusercontent.com/SorbetUP/ElephantNote/addon-catalog/')
    expect(rust).toContain('url.host_str() != Some("raw.githubusercontent.com")')
    expect(rust).toContain('/SorbetUP/ElephantNote/addon-catalog/')
    expect(rust).toContain('Catalogue files for {} must stay under {}')
    expect(rust).toContain('addons::tauri_addons_install(app, state, package_string)')
    expect(lib).toContain('addon_catalog::tauri_addons_catalog_list')
    expect(lib).toContain('addon_catalog::tauri_addons_catalog_install')
  })
})

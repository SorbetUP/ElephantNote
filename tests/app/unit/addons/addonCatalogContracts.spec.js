import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('official addon branch catalogue', () => {
  it('uses Installed addons instead of Core addons', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

    expect(panel).toContain('<h3>Installed addons</h3>')
    expect(panel).toContain('<h3>Built-in addon catalogue</h3>')
    expect(panel).not.toContain('<h3>Core addons</h3>')
  })

  it('shows community catalogue entries with real install and update actions', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const logic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const store = read('Elephant/frontend/src/renderer/src/store/addons.js')

    expect(panel).toContain('<h3>Browse official community addons</h3>')
    expect(panel).toContain('v-for="addon in availableCatalogAddons"')
    expect(panel).toContain("addon.updateAvailable ? 'Update' : addon.installed ? 'Installed' : 'Install'")
    expect(logic).toContain('await addonsStore.loadAddonCatalog()')
    expect(logic).toContain('await addonsStore.installCatalogAddon(addon.id)')
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

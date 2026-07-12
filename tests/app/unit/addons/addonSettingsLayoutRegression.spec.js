const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('addon settings open on the complete catalogue and keep detail opt-in', () => {
  const source = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

  assert.match(source, /const selectedAddonId = ref\(''\)/)
  assert.match(source, /class="en-addon-browser-overview"/)
  assert.match(source, /<h2>All addons<\/h2>/)
  assert.match(source, /class="en-addon-detail-back"/)
  assert.doesNotMatch(source, /CORE_ADDON_IDS/)
  assert.doesNotMatch(source, /\|\| browserEntries\.value\[0\]/)
})

test('addon list and addon content own independent scroll containers', () => {
  const styles = read('Elephant/frontend/app/components/settings/addons-settings.css')

  assert.match(styles, /\.en-addon-browser-list[^}]*overflow-y: auto/)
  assert.match(styles, /\.en-addon-browser-detail, \.en-addon-browser-overview[^}]*overflow-y: auto/)
  assert.match(styles, /\.en-addon-browser-sidebar[^}]*overflow: hidden/)
  assert.match(styles, /overscroll-behavior: contain/)
})

test('sidebar width is controlled only by the direct resize separator', () => {
  const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
  const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
  const runtimeStyles = read('Elephant/frontend/app/styles/app-shell-runtime-fixes.css')
  const topBar = read('Elephant/frontend/app/components/shell/TopVaultBar.vue')

  assert.doesNotMatch(settings, /Sidebar width/)
  assert.doesNotMatch(settings, /update-sidebar-width/)
  assert.match(shell, /class="en-sidebar-resizer"/)
  assert.match(shell, /@pointerdown="startResize"/)
  assert.match(shell, /--en-sidebar-runtime-width/)
  assert.match(runtimeStyles, /--en-sidebar-width: var\(--en-sidebar-runtime-width/)
  assert.match(topBar, /left: calc\(48px \+ var\(--en-sidebar-width\)\)/)
  assert.match(topBar, /width: 1px/)
})

test('AI settings own a single module toolbar', () => {
  const source = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')

  assert.equal((source.match(/class="en-ai-module-tabs"/g) || []).length, 1)
  assert.doesNotMatch(source, /<AiProviderSettingsPanel/)
})

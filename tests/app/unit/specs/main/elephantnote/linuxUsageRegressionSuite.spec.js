import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const catalog = JSON.parse(read('tests/app/usage/linux/scenarios.json'))
const runner = read('build/scripts/run-desktop-acceptance.mjs')
const server = read('Elephant/backend/tauri/src/acceptance_server.rs')
const client = read('build/scripts/elephant-automation-client.mjs')
const enhancements = read('Elephant/frontend/src/renderer/src/platform/automationBridgeEnhancements.js')
const workflow = read('.github/workflows/e2e.yml')
const packageJson = JSON.parse(read('package.json'))
const appPage = read('Elephant/frontend/src/renderer/src/pages/app.vue')

const expectedIds = [
  'startup-render',
  'vault-chooser-first-run',
  'library-layout-roundtrip',
  'library-title-sort',
  'sidebar-hide-show',
  'search-roundtrip',
  'search-no-results',
  'settings-roundtrip',
  'theme-mode-roundtrip',
  'open-existing-note',
  'editor-write-autosave-preview',
  'note-close-roundtrip',
  'pin-unpin-note',
  'addon-install-enable-action',
  'reload-preserves-vault',
  'navigation-stress'
]

const removedPlaywrightFiles = [
  'tests/app/e2e/playwright.config.js',
  'tests/app/e2e/helpers.js',
  'tests/app/e2e/electron-main.js',
  'tests/app/e2e/tauri-preload-entry.js',
  'tests/app/e2e/official-addons-regressions.spec.js',
  'tests/app/e2e/linux-usage-regressions.spec.js'
]

describe('progressive Linux application usage simulations', () => {
  it('keeps a unique permanent scenario catalog with non-duplicated evidence policy', () => {
    expect(catalog.schemaVersion).toBe(2)
    expect(catalog.policy.requiredOnPullRequest).toBe(true)
    expect(catalog.policy.captureDistinctVisualStates).toBe(true)
    expect(catalog.policy.rejectPixelIdenticalScreenshots).toBe(true)
    expect(catalog.policy.captureStateEvidence).toBe(true)
    expect(catalog.policy.failOnPageError).toBe(true)
    expect(catalog.policy.failOnConsoleError).toBe(true)

    const ids = catalog.scenarios.map((scenario) => scenario.id)
    expect(ids).toEqual(expectedIds)
    expect(new Set(ids).size).toBe(ids.length)
    for (const scenario of catalog.scenarios) {
      expect(scenario.description.length).toBeGreaterThan(25)
      expect(scenario.regression.length).toBeGreaterThan(20)
      expect(scenario.tags.length).toBeGreaterThan(0)
    }
  })

  it('covers the catalog surfaces through the real Tauri automation runner', () => {
    for (const marker of [
      "readDom', '.en-empty-card'",
      "selectVault', vaultRoot",
      'listBefore',
      'listView',
      'sortedLibrary',
      'sidebarToggled',
      'searchUi',
      'searchEmptyUi',
      'settingsSearch',
      'themeToggled',
      "openNote', 'Getting Started/Welcome.md'",
      'Live Tauri body edit 9173.',
      "click', '[aria-label=\"Close note\"]'",
      "click', '[aria-label=\"Pin note\"]'",
      "installOfficialAddon', addonId",
      'restartPersistence',
      'navigationCycles'
    ]) {
      expect(runner).toContain(marker)
    }
    expect(runner).toContain("'[data-testid=\"muya-rust-runtime-editor\"]'")
    expect(runner).toContain("command('logs')")
    expect(runner).toContain("runtime: 'tauri'")
  })

  it('exposes authenticated semantic UI and log inspection for agents', () => {
    expect(server).toContain('ELEPHANT_AUTOMATION_PORT')
    expect(server).toContain('Authorization: Bearer <token>')
    expect(server).toContain('"/v1/ui"')
    expect(server).toContain('"/v1/logs"')
    expect(server).toContain('"/v1/batch"')
    expect(client).toContain('export class ElephantAutomationClient')
    expect(client).toContain('authorization: `Bearer ${this.token}`')
    expect(enhancements).toContain('api.uiSnapshot =')
    expect(enhancements).toContain('api.assertUi =')
    expect(enhancements).toContain('api.assertLogs =')
  })

  it('removes Playwright and runs the packaged app API under Xvfb', () => {
    for (const file of removedPlaywrightFiles) {
      expect(fs.existsSync(path.join(root, file)), file).toBe(false)
    }
    expect(packageJson.devDependencies?.playwright).toBeUndefined()
    expect(packageJson.scripts['test:e2e']).toBe('pnpm test:automation')
    expect(workflow).toContain('Linux packaged app automation and official addon scenarios')
    expect(workflow).toContain('xvfb-run --auto-servernum env')
    expect(workflow).toContain('pnpm test:automation:raw')
    expect(workflow).toContain('test-results/acceptance/**')
    expect(workflow).not.toContain('playwright')
  })

  it('does not bypass the real NoteEditorHost with a second full-window editor', () => {
    expect(appPage).toContain('<app-shell v-if="init" />')
    expect(appPage).not.toContain('MuyaRuntimeEditor')
    expect(appPage).not.toContain('muya-runtime-production-editor')
    expect(appPage).not.toContain('muya-runtime-underlay')
  })
})

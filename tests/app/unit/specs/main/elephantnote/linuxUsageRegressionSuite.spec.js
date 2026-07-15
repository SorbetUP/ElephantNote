import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const catalog = JSON.parse(read('tests/app/usage/linux/scenarios.json'))
const suite = read('tests/app/e2e/linux-usage-regressions.spec.js')
const main = read('tests/app/e2e/linux-usage-main.cjs')
const workflow = read('.github/workflows/e2e.yml')
const config = read('tests/app/e2e/playwright.config.js')

const expectedIds = [
  'startup-render',
  'library-layout-roundtrip',
  'library-title-sort',
  'sidebar-hide-show',
  'search-roundtrip',
  'search-no-results',
  'settings-roundtrip',
  'theme-mode-roundtrip',
  'open-existing-note',
  'note-close-roundtrip',
  'pin-unpin-note',
  'reload-preserves-vault',
  'navigation-stress'
]

describe('progressive Linux application usage simulations', () => {
  it('keeps a unique permanent scenario catalog', () => {
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.policy.requiredOnPullRequest).toBe(true)
    expect(catalog.policy.captureScreenshotPerScenario).toBe(true)
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

  it('connects every catalog entry to a real Electron scenario', () => {
    for (const id of expectedIds) {
      expect(suite).toContain(`defineUsageTest('${id}'`)
      expect(suite).toContain(`[linux-usage:${'${id}'}]`)
    }
    expect(suite).toContain("require('playwright/test')")
    expect(suite).toContain('electron.launch')
    expect(suite).toContain('page.screenshot')
    expect(suite).toContain("page.on('pageerror'")
    expect(suite).toContain("message.type() === 'error'")
    expect(suite).toContain("getByTestId('muya-rust-runtime-editor')")
  })

  it('runs against the production renderer under Xvfb and retains diagnostics', () => {
    expect(main).toContain("require('electron')")
    expect(main).toContain('tauri-preload.js')
    expect(main).toContain('ELEPHANT_E2E_RENDERER_URL')
    expect(workflow).toContain('ubuntu-24.04')
    expect(workflow).toContain('xvfb-run --auto-servernum pnpm test:e2e')
    expect(workflow).toContain('test-results/**')
    expect(workflow).toContain('playwright-report/**')
    expect(workflow).toContain('e2e-results.json')
    expect(config).toContain("['json', { outputFile: 'test-results/e2e-results.json' }]")
    expect(config).toContain("screenshot: 'only-on-failure'")
    expect(config).toContain("trace: 'retain-on-failure'")
  })
})

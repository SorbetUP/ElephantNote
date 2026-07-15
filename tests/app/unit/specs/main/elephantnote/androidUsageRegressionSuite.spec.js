import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const catalog = JSON.parse(read('tests/app/usage/android/scenarios.json'))
const suite = read('build/scripts/android_usage_regression_suite.sh')
const startup = read('build/scripts/android_startup_smoke.sh')
const workflow = read('.github/workflows/android-apk.yml')

const expectedScenarios = [
  'startup-render',
  'search-roundtrip',
  'settings-roundtrip',
  'drawer-open',
  'library-layout-toggle',
  'library-sort-sheet',
  'open-existing-note',
  'drawer-back-close',
  'note-back-roundtrip',
  'app-background-resume',
  'process-relaunch',
  'search-no-results',
  'search-repeat-stability',
  'settings-back-navigation',
  'keyboard-dismissal',
  'navigation-stress'
]

describe('progressive Android app usage regression suite', () => {
  it('maintains one unique permanent scenario per reproduced product regression', () => {
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.policy.requiredOnPullRequest).toBe(true)
    expect(catalog.policy.captureScreenshotPerScenario).toBe(true)
    expect(catalog.policy.captureUiTreePerScenario).toBe(true)
    expect(catalog.policy.failOnRendererException).toBe(true)
    expect(catalog.policy.continueAfterScenarioFailure).toBe(true)

    const ids = catalog.scenarios.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expectedScenarios)

    for (const scenario of catalog.scenarios) {
      expect(scenario.description.length).toBeGreaterThan(20)
      expect(scenario.regression.length).toBeGreaterThan(10)
      expect(scenario.tags.length).toBeGreaterThan(0)
    }
  })

  it('keeps every catalogued regression connected to an executable runner', () => {
    const startupScenarios = catalog.scenarios
      .filter((scenario) => scenario.runner === 'startup-smoke')
      .map((scenario) => scenario.id)
    const regressionScenarios = catalog.scenarios
      .filter((scenario) => scenario.runner === 'android-regression')
      .map((scenario) => scenario.id)

    expect(startupScenarios).toEqual([
      'startup-render',
      'search-roundtrip',
      'settings-roundtrip',
      'drawer-open'
    ])
    expect(startup).toContain('white_screen=false')
    expect(startup).toContain('search_ready=true')
    expect(startup).toContain('settings_ready=true')
    expect(startup).toContain('drawer_ready=true')

    for (const id of regressionScenarios) {
      expect(suite).toContain(`${id})`)
      expect(suite).toContain(`run_scenario "$scenario"`)
    }
    expect(suite).toContain("scenario.get('runner') == 'android-regression'")
    expect(suite).toContain('No Android usage implementation exists')
  })

  it('continues after individual failures and emits aggregate diagnostics', () => {
    expect(suite).toContain('FAILURES=$((FAILURES + 1))')
    expect(suite).toContain('emit_reports')
    expect(suite).toContain('[ "$FAILURES" -eq 0 ]')
    expect(suite).toContain('capture_checkpoint')
    expect(suite).toContain('assert_not_blank')
    expect(suite).toContain('android-usage-${id}.log')
  })

  it('runs real emulator interactions and publishes machine-readable diagnostics', () => {
    expect(workflow).toContain('bash build/scripts/android_startup_smoke.sh')
    expect(workflow).toContain('bash build/scripts/android_usage_regression_suite.sh')
    expect(workflow).toContain('android-usage-summary.json')
    expect(workflow).toContain('android-usage-junit.xml')
    expect(workflow).toContain('android-usage-results.tsv')
    expect(workflow).toContain('android-usage-logcat.txt')
    expect(workflow).toContain('android-*.png')
    expect(workflow).toContain('android-*.xml')

    expect(suite).toContain('adb shell uiautomator dump')
    expect(suite).toContain('adb exec-out screencap -p')
    expect(suite).toContain('assert_no_renderer_regression')
    expect(suite).toContain('assert_process_alive')
    expect(suite).toContain("classname': 'android.app-usage'")
  })
})

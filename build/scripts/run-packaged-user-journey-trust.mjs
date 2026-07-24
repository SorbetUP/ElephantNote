#!/usr/bin/env node

import { createRealAppHarness } from './lib/real-app-harness.mjs'

const layer = 'user-journey'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const marker = 'packaged-user-marker-9173'

const harness = createRealAppHarness({
  suite: 'packaged-user-journey',
  requirePackagedApp: true,
  initialFiles: {
    'Journey acceptance.md': '# Journey acceptance\n\nBefore user interaction.\n',
    'Journey search.md': `# Journey search\n\n${marker}\n`
  }
})

let failure = null
try {
  await harness.start()

  await harness.runScenario('user-clean-install-first-screen', layer, async() => {
    const firstRun = await harness.action(layer, 'readDom', '.en-empty-card')
    if (!firstRun.exists || !firstRun.visible || !firstRun.text.includes('Choose your first vault')) {
      throw new Error(`Packaged clean-install screen is not usable: ${JSON.stringify(firstRun)}`)
    }
    return { text: firstRun.text }
  })

  // Native folder selection itself is platform-owned. It is fixture setup and is
  // recorded separately; every claimed user action after this point is DOM input.
  await harness.setup('selectVault', harness.vaultRoot)
  await harness.setup('openNote', 'Journey acceptance.md')

  await harness.runScenario('user-edit-visible-and-persisted', layer, async() => {
    const editor = await harness.action(layer, 'waitFor', editorSelector, 10_000)
    await harness.action(layer, 'selectText', editorSelector, editor.text.length, editor.text.length)
    await harness.action(layer, 'insertText', editorSelector, ` ${marker}`)
    await harness.action(layer, 'press', editorSelector, 'Enter')
    await harness.action(layer, 'insertText', editorSelector, 'second packaged line')

    const persisted = await harness.waitForVaultFile('Journey acceptance.md', (content) => (
      content.includes(marker) && content.includes('second packaged line')
    ), 20_000)
    const visible = await harness.action(layer, 'readDom', editorSelector)
    if (!visible.text.includes(marker) || !visible.text.includes('second packaged line')) {
      throw new Error(`Packaged editor is not showing what reached disk: ${JSON.stringify(visible)}`)
    }
    return { bytes: persisted.length, visibleBytes: visible.text.length }
  })

  await harness.runScenario('user-theme-choice-visible', layer, async() => {
    await harness.action(layer, 'click', '[aria-label="Settings"]')
    await harness.action(layer, 'waitFor', '.en-settings-panel', 10_000)
    await harness.action(layer, 'click', '.en-settings-nav button:first-child')
    await harness.action(layer, 'waitFor', '.en-settings-content[data-active-section="appearance"]', 10_000)
    const before = await harness.action(layer, 'readDom', '.en-shell')
    const initiallyDark = before.attributes.class?.includes('en-theme-dark') === true
    const targetSelector = initiallyDark ? '.en-segmented button:nth-child(1)' : '.en-segmented button:nth-child(2)'
    await harness.action(layer, 'click', targetSelector)
    const changed = await harness.action(layer, 'readDom', '.en-shell')
    const changedDark = changed.attributes.class?.includes('en-theme-dark') === true
    if (changedDark === initiallyDark) throw new Error(`Packaged theme control did not change the visible application: ${JSON.stringify({ before, changed })}`)
    await harness.action(layer, 'click', '[aria-label="Close settings"]')
    await harness.action(layer, 'waitUntilGone', '.en-settings-panel', 10_000)
    return { initiallyDark, expectedDarkAfterRestart: changedDark }
  })

  const expectedTheme = harness.scenarios.find((scenario) => scenario.id === 'user-theme-choice-visible')?.evidence?.expectedDarkAfterRestart

  await harness.runScenario('user-crash-restart-restores-visible-work', layer, async() => {
    await harness.restart({ crash: true })
    const editor = await harness.action(layer, 'waitFor', editorSelector, 20_000)
    const shell = await harness.action(layer, 'readDom', '.en-shell')
    const persisted = harness.readVaultFile('Journey acceptance.md')
    const visibleDark = shell.attributes.class?.includes('en-theme-dark') === true
    if (!editor.text.includes(marker) || !editor.text.includes('second packaged line')) {
      throw new Error(`Packaged application did not restore the edited note visibly after a crash restart: ${JSON.stringify(editor)}`)
    }
    if (!persisted.includes(marker) || !persisted.includes('second packaged line')) {
      throw new Error(`Packaged application lost persisted work after restart: ${JSON.stringify(persisted)}`)
    }
    if (visibleDark !== expectedTheme) {
      throw new Error(`Packaged application did not restore the visible theme choice: ${JSON.stringify({ expectedTheme, visibleDark, shell })}`)
    }
    return { restoredText: true, restoredDisk: true, restoredTheme: true }
  })

  await harness.runScenario('user-search-after-restart', layer, async() => {
    await harness.action(layer, 'click', '.en-rail-icon[aria-label="Search"]')
    await harness.action(layer, 'waitFor', '.en-search-bar-input', 10_000)
    await harness.action(layer, 'fill', '.en-search-bar-input', marker)
    await harness.action(layer, 'press', '.en-search-bar-input', 'Enter')
    const results = await harness.action(layer, 'waitFor', '.en-search-results', 10_000)
    if (!results.text.includes('Journey acceptance') && !results.text.includes('Journey search')) {
      throw new Error(`Packaged search cannot find persisted user content after restart: ${JSON.stringify(results)}`)
    }
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'waitUntilGone', '.en-search-bar-input', 10_000)
    return { resultText: results.text }
  })

  await harness.runScenario('user-session-has-no-unexpected-automation-errors', layer, async() => {
    const logs = await harness.action(layer, 'logs')
    const unexpected = logs.filter((entry) => (
      /(?:^|:)error$/.test(String(entry?.event || '')) &&
      !String(entry?.event || '').includes('expected')
    ))
    if (unexpected.length > 0) {
      throw new Error(`Packaged user journey produced ${unexpected.length} unexpected application error event(s): ${JSON.stringify(unexpected.slice(0, 10))}`)
    }
    return { logCount: logs.length }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Exact packaged executable, clean startup, visible user input, autosave to the real vault, forced crash, visible restoration, persisted preference and search after restart.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) throw failure

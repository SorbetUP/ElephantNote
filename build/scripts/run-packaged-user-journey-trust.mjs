#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createRealAppHarness } from './lib/real-app-harness.mjs'

const layer = 'user-journey'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const marker = 'packaged-user-marker-9173'
const physicalMarker = 'physical-slowtype-9173'
const physicalSecondLine = 'physical-second-line-9173'
const recoveryMarker = 'recovery-before-autosave-9173'

const harness = createRealAppHarness({
  suite: 'packaged-user-journey',
  requirePackagedApp: true,
  initialFiles: {
    'Journey acceptance.md': '# Journey acceptance\n\nBefore user interaction.\n',
    'Journey search.md': `# Journey search\n\n${marker}\n`
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const waitForState = async(predicate, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let state = null
  while (Date.now() <= deadline) {
    state = await harness.action(layer, 'readState')
    if (predicate(state)) return state
    await sleep(50)
  }
  throw new Error(`${label}: application state did not reach the expected value: ${JSON.stringify(state)}`)
}

const xdotool = (args) => execFileSync('xdotool', args, {
  encoding: 'utf8',
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
}).trim()

const typeWithPhysicalX11Keyboard = (text, delayMs = 80) => {
  if (process.platform !== 'linux') {
    throw new Error('The physical packaged-editor proof requires the Linux AppImage under X11/Xvfb.')
  }
  const focusedWindow = xdotool(['getwindowfocus', 'getwindowname'])
  xdotool(['type', '--clearmodifiers', '--delay', String(delayMs), '--', text])
  return focusedWindow
}

const pressWithPhysicalX11Keyboard = (key) => {
  if (process.platform !== 'linux') {
    throw new Error('The physical packaged-editor proof requires the Linux AppImage under X11/Xvfb.')
  }
  xdotool(['key', '--clearmodifiers', key])
}

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

  await harness.runScenario('user-physical-x11-input-rust-disk', layer, async() => {
    const before = await harness.action(layer, 'readDom', editorSelector)
    await harness.action(layer, 'selectText', editorSelector, before.text.length, before.text.length)
    const focusedWindow = typeWithPhysicalX11Keyboard(physicalMarker)
    pressWithPhysicalX11Keyboard('Return')
    typeWithPhysicalX11Keyboard(physicalSecondLine)

    const state = await waitForState((value) => (
      String(value?.markdown || '').includes(physicalMarker) &&
      String(value?.markdown || '').includes(physicalSecondLine)
    ), 'physical-x11-input-rust-state', 20_000)
    const persisted = await harness.waitForVaultFile('Journey acceptance.md', (content) => (
      content.includes(physicalMarker) && content.includes(physicalSecondLine)
    ), 20_000)
    const visible = await harness.action(layer, 'readDom', editorSelector)
    if (!visible.text.includes(physicalMarker) || !visible.text.includes(physicalSecondLine)) {
      throw new Error(`Physical X11 typing reached state/disk but not the visible editor: ${JSON.stringify(visible)}`)
    }
    return {
      focusedWindow,
      physicalTypingDelayMs: 80,
      rustMarkdownBytes: String(state.markdown || '').length,
      persistedBytes: persisted.length,
      visibleBytes: visible.text.length
    }
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
    const before = await harness.action(layer, 'readDom', editorSelector)
    await harness.action(layer, 'selectText', editorSelector, before.text.length, before.text.length)

    // insertText returns only after the production recovery checkpoint acknowledges
    // the new revision. Kill immediately afterwards, before the one-second file
    // autosave timer can be relied upon, to exercise journal recovery rather than
    // ordinary persisted-file reopening.
    await harness.action(layer, 'insertText', editorSelector, ` ${recoveryMarker}`)
    const diskBeforeCrash = harness.readVaultFile('Journey acceptance.md')
    if (diskBeforeCrash.includes(recoveryMarker)) {
      throw new Error('Crash-recovery scenario did not interrupt the autosave window; the marker was already on disk.')
    }

    await harness.restart({ crash: true })
    const editor = await harness.action(layer, 'waitFor', editorSelector, 20_000)
    const state = await waitForState((value) => String(value?.markdown || '').includes(recoveryMarker), 'crash-recovery-buffered-state', 20_000)
    const shell = await harness.action(layer, 'readDom', '.en-shell')
    const recoveredDisk = await harness.waitForVaultFile(
      'Journey acceptance.md',
      (content) => content.includes(recoveryMarker),
      20_000
    )
    const visibleDark = shell.attributes.class?.includes('en-theme-dark') === true

    if (!editor.text.includes(recoveryMarker)) {
      throw new Error(`Packaged application did not restore the checkpointed edit visibly after SIGKILL: ${JSON.stringify(editor)}`)
    }
    if (!String(state?.markdown || '').includes(recoveryMarker)) {
      throw new Error(`Packaged application did not restore the checkpointed Rust/Markdown state: ${JSON.stringify(state)}`)
    }
    if (!recoveredDisk.includes(recoveryMarker)) {
      throw new Error(`Recovered checkpoint was not written back to the vault: ${JSON.stringify(recoveredDisk)}`)
    }
    if (visibleDark !== expectedTheme) {
      throw new Error(`Packaged application did not restore the visible theme choice: ${JSON.stringify({ expectedTheme, visibleDark, shell })}`)
    }
    return {
      markerAbsentFromDiskAtKill: true,
      restoredVisible: true,
      restoredMarkdown: true,
      restoredToDisk: true,
      restoredTheme: true
    }
  })

  await harness.runScenario('user-search-after-restart', layer, async() => {
    await harness.action(layer, 'click', '.en-rail-icon[aria-label="Search"]')
    await harness.action(layer, 'waitFor', '.en-search-bar-input', 10_000)
    await harness.action(layer, 'fill', '.en-search-bar-input', recoveryMarker)
    await harness.action(layer, 'press', '.en-search-bar-input', 'Enter')
    const results = await harness.action(layer, 'waitFor', '.en-search-results', 10_000)
    if (!results.text.includes('Journey acceptance')) {
      throw new Error(`Packaged search cannot find recovered user content after restart: ${JSON.stringify(results)}`)
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
      proofBoundary: 'Exact Linux AppImage, clean startup, synthetic browser input plus slow physical X11 keyboard input, canonical Rust/Markdown state, real vault persistence, SIGKILL before autosave, recovery checkpoint restoration, visible restoration and search.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) throw failure

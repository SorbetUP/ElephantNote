#!/usr/bin/env node

import { createRealAppHarness } from './lib/real-app-harness.mjs'

const layer = 'user-journey'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const editorInputSelector = `${editorSelector}[contenteditable="true"], ${editorSelector} [contenteditable="true"]`
const marker = 'bazzite-wayland-marker-9173'
const unicodeLine = 'Bazzite Wayland — élève, 日本語, مرحبا, 👩🏽‍💻'
const recoveryMarker = 'bazzite-recovery-before-autosave-9173'

if (process.platform !== 'linux') throw new Error('Bazzite proof requires Linux.')
if (String(process.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'wayland') {
  throw new Error(`Bazzite proof requires XDG_SESSION_TYPE=wayland, received ${JSON.stringify(process.env.XDG_SESSION_TYPE || null)}`)
}
if (!process.env.WAYLAND_DISPLAY) throw new Error('Bazzite proof requires WAYLAND_DISPLAY.')

const harness = createRealAppHarness({
  suite: 'bazzite-packaged-user-journey',
  requirePackagedApp: true,
  initialFiles: {
    'Bazzite acceptance.md': '# Bazzite acceptance\n\nBefore user interaction.\n',
    'Bazzite search.md': `# Bazzite search\n\n${marker}\n`
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const waitForState = async(predicate, label, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  let state = null
  while (Date.now() <= deadline) {
    state = await harness.action(layer, 'readState')
    if (predicate(state)) return state
    await sleep(50)
  }
  throw new Error(`${label}: application state did not reach the expected value: ${JSON.stringify(state)}`)
}

const waitForDom = async(selector, predicate, label, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  let value = null
  while (Date.now() <= deadline) {
    value = await harness.action(layer, 'readDom', selector)
    if (predicate(value)) return value
    await sleep(50)
  }
  throw new Error(`${label}: visible DOM did not reach the expected value: ${JSON.stringify(value)}`)
}

let failure = null
try {
  await harness.start()

  await harness.runScenario('bazzite-clean-install-first-screen', layer, async() => {
    const firstRun = await harness.action(layer, 'readDom', '.en-empty-card')
    if (!firstRun.exists || !firstRun.visible || !firstRun.text.includes('Choose your first vault')) {
      throw new Error(`Bazzite clean-install screen is not usable: ${JSON.stringify(firstRun)}`)
    }
    return { text: firstRun.text }
  })

  // Native portal selection is validated separately by the host preflight. The
  // fixture setup itself is not counted as a user interaction claim.
  await harness.setup('selectVault', harness.vaultRoot)
  await harness.setup('openNote', 'Bazzite acceptance.md')

  await harness.runScenario('bazzite-wayland-visible-input-rust-disk', layer, async() => {
    const editor = await harness.action(layer, 'waitFor', editorInputSelector, 20_000)
    await harness.action(layer, 'selectText', editorInputSelector, editor.text.length, editor.text.length)
    await harness.action(layer, 'insertText', editorInputSelector, ` ${marker}`)
    await harness.action(layer, 'press', editorInputSelector, 'Enter')
    await harness.action(layer, 'insertText', editorInputSelector, unicodeLine)

    const state = await waitForState((value) => (
      String(value?.markdown || '').includes(marker) && String(value?.markdown || '').includes(unicodeLine)
    ), 'bazzite-wayland-canonical-state')
    const persisted = await harness.waitForVaultFile('Bazzite acceptance.md', (content) => (
      content.includes(marker) && content.includes(unicodeLine)
    ), 20_000)
    const saved = await waitForState((value) => (
      value?.isSaved === true && String(value?.markdown || '').includes(unicodeLine)
    ), 'bazzite-wayland-saved-state')
    const visible = await waitForDom(editorSelector, (value) => (
      value?.visible && value.text.includes(marker) && value.text.includes(unicodeLine)
    ), 'bazzite-wayland-visible-editor')

    return {
      inputTransport: 'external-automation-visible-contenteditable',
      sessionType: process.env.XDG_SESSION_TYPE,
      waylandDisplay: process.env.WAYLAND_DISPLAY,
      canonicalBytes: String(state.markdown || '').length,
      persistedBytes: persisted.length,
      visibleBytes: visible.text.length,
      savedAfterDisk: saved.isSaved
    }
  })

  await harness.runScenario('bazzite-theme-choice-persists', layer, async() => {
    await harness.action(layer, 'click', '[aria-label="Settings"]')
    await harness.action(layer, 'waitFor', '.en-settings-panel', 20_000)
    await harness.action(layer, 'click', '.en-settings-nav button:first-child')
    await harness.action(layer, 'waitFor', '.en-settings-content[data-active-section="appearance"]', 20_000)
    const before = await harness.action(layer, 'readDom', '.en-shell')
    const initiallyDark = before.attributes.class?.includes('en-theme-dark') === true
    const target = initiallyDark ? '.en-segmented button:nth-child(1)' : '.en-segmented button:nth-child(2)'
    await harness.action(layer, 'click', target)
    const changed = await waitForDom('.en-shell', (value) => (
      (value.attributes.class?.includes('en-theme-dark') === true) !== initiallyDark
    ), 'bazzite-theme-change')
    await harness.action(layer, 'click', '[aria-label="Close settings"]')
    await harness.action(layer, 'waitUntilGone', '.en-settings-panel', 20_000)
    return { expectedDarkAfterRestart: changed.attributes.class?.includes('en-theme-dark') === true }
  })

  const expectedTheme = harness.scenarios.find((scenario) => scenario.id === 'bazzite-theme-choice-persists')?.evidence?.expectedDarkAfterRestart

  await harness.runScenario('bazzite-crash-restart-restores-visible-work', layer, async() => {
    const editor = await harness.action(layer, 'readDom', editorInputSelector)
    await harness.action(layer, 'selectText', editorInputSelector, editor.text.length, editor.text.length)
    await harness.action(layer, 'insertText', editorInputSelector, ` ${recoveryMarker}`)
    const beforeCrash = await harness.action(layer, 'readState')
    if (!String(beforeCrash?.markdown || '').includes(recoveryMarker) || beforeCrash?.isSaved !== false) {
      throw new Error(`Bazzite crash-window revision is not canonical and unsaved: ${JSON.stringify(beforeCrash)}`)
    }
    if (harness.readVaultFile('Bazzite acceptance.md').includes(recoveryMarker)) {
      throw new Error('Bazzite recovery marker reached disk before SIGKILL.')
    }

    await harness.restart({ crash: true })
    const visible = await waitForDom(editorSelector, (value) => value?.visible && value.text.includes(recoveryMarker), 'bazzite-recovered-visible-editor')
    const recovered = await waitForState((value) => String(value?.markdown || '').includes(recoveryMarker), 'bazzite-recovered-canonical-state')
    const disk = await harness.waitForVaultFile('Bazzite acceptance.md', (content) => content.includes(recoveryMarker), 20_000)
    const saved = await waitForState((value) => value?.isSaved === true && String(value?.markdown || '').includes(recoveryMarker), 'bazzite-recovered-saved-state')
    const shell = await harness.action(layer, 'readDom', '.en-shell')
    const visibleDark = shell.attributes.class?.includes('en-theme-dark') === true
    if (visibleDark !== expectedTheme) {
      throw new Error(`Bazzite theme did not persist across SIGKILL: ${JSON.stringify({ expectedTheme, visibleDark })}`)
    }

    return {
      markerAbsentFromDiskAtKill: true,
      stateExplicitlyUnsavedAtKill: beforeCrash.isSaved === false,
      restoredVisible: visible.text.includes(recoveryMarker),
      restoredCanonical: String(recovered.markdown || '').includes(recoveryMarker),
      restoredToDisk: disk.includes(recoveryMarker),
      savedAfterRecovery: saved.isSaved,
      restoredTheme: true
    }
  })

  await harness.runScenario('bazzite-search-after-restart', layer, async() => {
    await harness.action(layer, 'click', '.en-rail-icon[aria-label="Search"]')
    await harness.action(layer, 'waitFor', '.en-search-bar-input', 20_000)
    await harness.action(layer, 'fill', '.en-search-bar-input', recoveryMarker)
    await harness.action(layer, 'press', '.en-search-bar-input', 'Enter')
    const results = await waitForDom('.en-search-results', (value) => value?.visible && value.text.includes('Bazzite acceptance'), 'bazzite-search-result')
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'waitUntilGone', '.en-search-bar-input', 20_000)
    return { resultText: results.text }
  })

  await harness.runScenario('bazzite-session-has-no-unexpected-errors', layer, async() => {
    const logs = await harness.action(layer, 'logs')
    const unexpected = logs.filter((entry) => (
      String(entry?.level || '').toLowerCase() === 'error' ||
      (/(?:^|:)error$/.test(String(entry?.event || '')) && !String(entry?.event || '').includes('expected'))
    ))
    if (unexpected.length) {
      throw new Error(`Bazzite journey produced ${unexpected.length} unexpected error(s): ${JSON.stringify(unexpected.slice(0, 10))}`)
    }
    return { logCount: logs.length }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      platform: {
        os: 'bazzite',
        sessionType: process.env.XDG_SESSION_TYPE,
        waylandDisplay: process.env.WAYLAND_DISPLAY,
        desktop: process.env.XDG_CURRENT_DESKTOP || null
      },
      proofBoundary: 'Exact Linux AppImage on a real Bazzite Wayland session, visible contenteditable input through the external automation boundary, canonical Rust state, real vault persistence, SIGKILL recovery, preference restoration and search. Native portal selection remains host-preflight evidence, not an automated user-journey claim.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) throw failure

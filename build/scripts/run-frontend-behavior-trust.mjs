#!/usr/bin/env node

import { createRealAppHarness } from './lib/real-app-harness.mjs'

const layer = 'frontend'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const uniqueSearchText = 'frontend-search-marker-9173'
const initialVisibleText = 'Initial visible text.'

const harness = createRealAppHarness({
  suite: 'frontend-behavior',
  buildRenderer: true,
  initialFiles: {
    'Frontend acceptance.md': '# Frontend acceptance\n\nInitial visible text.\n',
    'Search target.md': `# Search target\n\n${uniqueSearchText}\n`
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const waitForDom = async(selector, predicate, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() <= deadline) {
    last = await harness.action(layer, 'readDom', selector)
    if (predicate(last)) return last
    await sleep(50)
  }
  throw new Error(`${label}: visible DOM did not reach the expected state: ${JSON.stringify(last)}`)
}

const waitForStableEditor = async(timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let previousText = null
  let stableReads = 0
  let last = null
  while (Date.now() <= deadline) {
    const editor = await harness.action(layer, 'readDom', editorSelector)
    if (editor?.exists && editor?.visible) {
      stableReads = previousText === editor.text ? stableReads + 1 : 1
      previousText = editor.text
      if (stableReads >= 2) return editor
    } else {
      stableReads = 0
      previousText = null
    }
    last = editor
    await sleep(50)
  }
  throw new Error(`Real Rust editor did not become stable: ${JSON.stringify(last)}`)
}

const expectedKeyboardResult = /^frontend line one\s*\n+\s*frontend line two\s*$/

let failure = null
try {
  await harness.start()

  const firstRun = await harness.setup('readDom', '.en-empty-card')
  if (!firstRun.exists || !firstRun.visible) {
    throw new Error(`Clean-start vault UI is not visible before setup: ${JSON.stringify(firstRun)}`)
  }
  // Setup is explicitly outside the frontend proof. The scenarios below are
  // constrained by the harness to DOM input and DOM/state observation only.
  await harness.setup('selectVault', harness.vaultRoot)
  await harness.setup('openNote', 'Frontend acceptance.md')

  await harness.runScenario('frontend-editor-keyboard-autosave', layer, async() => {
    await harness.action(layer, 'waitFor', editorSelector, 10_000)
    const editor = await waitForStableEditor()
    // Muya renders a non-editable paragraph icon before the actual text node.
    // Selecting from offset zero therefore anchors the DOM range in that icon
    // and produces an empty selection. Locate the exact visible text in the
    // real editor snapshot and select only that editable text node range.
    const selectionStart = String(editor.text || '').indexOf(initialVisibleText)
    if (selectionStart < 0) {
      throw new Error(`Frontend editor did not expose the expected visible document: ${JSON.stringify(editor)}`)
    }
    const selectionEnd = selectionStart + initialVisibleText.length
    const selection = await harness.action(
      layer,
      'selectText',
      editorSelector,
      selectionStart,
      selectionEnd
    )
    if (
      selection?.start !== selectionStart ||
      selection?.end !== selectionEnd ||
      selection?.text !== initialVisibleText
    ) {
      throw new Error(`Frontend editor did not select the complete editable document text: ${JSON.stringify({ editor, selectionStart, selectionEnd, selection })}`)
    }
    await harness.action(layer, 'insertText', editorSelector, 'frontend line one')
    await harness.action(layer, 'press', editorSelector, 'Enter')
    await harness.action(layer, 'insertText', editorSelector, 'frontend line two')

    const deadline = Date.now() + 10_000
    let state = null
    while (Date.now() <= deadline) {
      state = await harness.action(layer, 'readState')
      if (expectedKeyboardResult.test(String(state?.markdown || ''))) break
      await sleep(50)
    }
    if (!expectedKeyboardResult.test(String(state?.markdown || ''))) {
      throw new Error(`Keyboard selection/Enter/input did not produce the exact expected frontend Markdown: ${JSON.stringify(state)}`)
    }

    const persisted = await harness.waitForVaultFile('Frontend acceptance.md', (content) => expectedKeyboardResult.test(content))
    const displayed = await waitForDom(
      editorSelector,
      (value) => value?.visible && value.text.includes('frontend line one') && value.text.includes('frontend line two'),
      'frontend-editor-visible-persistence'
    )
    return { persistedBytes: persisted.length, displayedTextBytes: displayed.text.length, selection }
  })

  await harness.runScenario('frontend-sidebar-toggle-roundtrip', layer, async() => {
    const before = await harness.action(layer, 'readDom', '.en-body')
    const beforeHidden = before.attributes.class?.includes('en-sidebar-hidden') === true
    await harness.action(layer, 'click', '.en-rail-sidebar-toggle')
    const toggled = await waitForDom(
      '.en-body',
      (value) => (value.attributes.class?.includes('en-sidebar-hidden') === true) !== beforeHidden,
      'frontend-sidebar-toggle'
    )
    await harness.action(layer, 'click', '.en-rail-sidebar-toggle')
    const restored = await waitForDom(
      '.en-body',
      (value) => (value.attributes.class?.includes('en-sidebar-hidden') === true) === beforeHidden,
      'frontend-sidebar-restore'
    )
    const toggledHidden = toggled.attributes.class?.includes('en-sidebar-hidden') === true
    const restoredHidden = restored.attributes.class?.includes('en-sidebar-hidden') === true
    if (toggledHidden === beforeHidden || restoredHidden !== beforeHidden) {
      throw new Error(`Sidebar frontend state did not round-trip: ${JSON.stringify({ before, toggled, restored })}`)
    }
    return { beforeHidden, toggledHidden, restoredHidden }
  })

  await harness.runScenario('frontend-search-visible-results', layer, async() => {
    await harness.action(layer, 'click', '.en-rail-icon[aria-label="Search"]')
    await harness.action(layer, 'waitFor', '.en-search-bar-input', 10_000)
    await harness.action(layer, 'fill', '.en-search-bar-input', uniqueSearchText)
    await harness.action(layer, 'press', '.en-search-bar-input', 'Enter')
    const results = await waitForDom(
      '.en-search-results',
      (value) => value?.visible && value.text.includes('Search target'),
      'frontend-search-matching-result'
    )
    await harness.action(layer, 'fill', '.en-search-bar-input', 'no-such-frontend-result-9173')
    await harness.action(layer, 'press', '.en-search-bar-input', 'Enter')
    const empty = await waitForDom(
      '.en-search-empty',
      (value) => value?.visible && Boolean(value.text.trim()),
      'frontend-search-empty-result'
    )
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
    await harness.action(layer, 'waitUntilGone', '.en-search-bar-input', 10_000)
    return { resultText: results.text, emptyText: empty.text }
  })

  await harness.runScenario('frontend-settings-visible-state', layer, async() => {
    await harness.action(layer, 'click', '[aria-label="Settings"]')
    await harness.action(layer, 'waitFor', '.en-settings-panel', 10_000)
    await harness.action(layer, 'fill', '[aria-label="Search all settings"]', 'autosave')
    const search = await waitForDom(
      '.en-settings-search-results',
      (value) => value?.visible && value.text.includes('Autosave'),
      'frontend-settings-autosave-search'
    )

    await harness.action(layer, 'fill', '[aria-label="Search all settings"]', '')
    await harness.action(layer, 'click', '.en-settings-nav button:first-child')
    await harness.action(layer, 'waitFor', '.en-settings-content[data-active-section="appearance"]', 10_000)
    const before = await harness.action(layer, 'readDom', '.en-shell')
    const initiallyDark = before.attributes.class?.includes('en-theme-dark') === true
    const toggleSelector = initiallyDark ? '.en-segmented button:nth-child(1)' : '.en-segmented button:nth-child(2)'
    const restoreSelector = initiallyDark ? '.en-segmented button:nth-child(2)' : '.en-segmented button:nth-child(1)'
    await harness.action(layer, 'click', toggleSelector)
    const toggled = await waitForDom(
      '.en-shell',
      (value) => (value.attributes.class?.includes('en-theme-dark') === true) !== initiallyDark,
      'frontend-theme-toggle'
    )
    await harness.action(layer, 'click', restoreSelector)
    const restored = await waitForDom(
      '.en-shell',
      (value) => value.attributes.class === before.attributes.class,
      'frontend-theme-restore'
    )
    const toggledDark = toggled.attributes.class?.includes('en-theme-dark') === true
    if (toggledDark === initiallyDark || restored.attributes.class !== before.attributes.class) {
      throw new Error(`Theme frontend state did not round-trip: ${JSON.stringify({ before, toggled, restored })}`)
    }
    await harness.action(layer, 'click', '[aria-label="Close settings"]')
    await harness.action(layer, 'waitUntilGone', '.en-settings-panel', 10_000)
    return { initiallyDark, toggledDark, searchText: search.text }
  })

  await harness.runScenario('frontend-navigation-does-not-teleport', layer, async() => {
    const cycles = []
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await harness.action(layer, 'click', '[aria-label="Settings"]')
      const settings = await harness.action(layer, 'waitFor', '.en-settings-panel', 10_000)
      await harness.action(layer, 'click', '[aria-label="Close settings"]')
      await harness.action(layer, 'waitUntilGone', '.en-settings-panel', 10_000)
      await harness.action(layer, 'click', '.en-rail-icon[aria-label="Search"]')
      const search = await harness.action(layer, 'waitFor', '.en-search-bar-input', 10_000)
      await harness.action(layer, 'press', '.en-search-bar-input', 'Escape')
      await harness.action(layer, 'waitUntilGone', '.en-search-bar-input', 10_000)
      const editor = await waitForDom(editorSelector, (value) => value?.visible, `frontend-navigation-editor-cycle-${cycle}`)
      if (!settings.visible || !search.visible || !editor.visible) {
        throw new Error(`Navigation cycle ${cycle} teleported or lost the editor surface: ${JSON.stringify({ settings, search, editor })}`)
      }
      cycles.push({ cycle, settings: true, search: true, editor: true })
    }
    return cycles
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Real renderer, visible DOM controls and keyboard/input events, frontend state, autosave observed on disk. Setup-only vault/note selection is excluded from the claim.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) throw failure

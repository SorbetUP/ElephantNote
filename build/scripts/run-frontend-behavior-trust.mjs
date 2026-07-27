#!/usr/bin/env node

import { createRealAppHarness } from './lib/real-app-harness.mjs'

const layer = 'frontend'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const editorInputSelector = `${editorSelector}[contenteditable="true"], ${editorSelector} [contenteditable="true"]`
const editableParagraphSelector = `${editorSelector} .ag-paragraph-content`
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

const expectedKeyboardResult = /# Frontend acceptance\s*\n+\s*frontend line one\s*\n+\s*frontend line two\s*$/

let failure = null
try {
  await harness.start()

  const firstRun = await harness.setup('readDom', '.en-empty-card')
  if (!firstRun.exists || !firstRun.visible) {
    throw new Error(`Clean-start vault UI is not visible before setup: ${JSON.stringify(firstRun)}`)
  }
  await harness.setup('selectVault', harness.vaultRoot)
  await harness.setup('openNote', 'Frontend acceptance.md')

  await harness.runScenario('frontend-editor-keyboard-autosave', layer, async() => {
    await harness.action(layer, 'waitFor', editorSelector, 10_000)
    await harness.action(layer, 'waitFor', editorInputSelector, 10_000)
    await waitForStableEditor()
    const paragraph = await harness.action(layer, 'readDom', editableParagraphSelector)
    if (!paragraph?.visible || paragraph.text !== initialVisibleText) {
      throw new Error(`Frontend editor did not expose the expected editable paragraph: ${JSON.stringify(paragraph)}`)
    }

    // Establish the exact range on the visible paragraph, then dispatch typing
    // and keyboard input at Muya's live contenteditable boundary. The stable
    // data-testid may be an outer runtime host in some packaged WebKit builds;
    // sending text to that host makes the production input primitive reject the
    // event before it reaches the visible editor.
    const selection = await harness.action(
      layer,
      'selectText',
      editableParagraphSelector,
      0,
      initialVisibleText.length
    )
    if (selection?.start !== 0 || selection?.end !== initialVisibleText.length || selection?.text !== initialVisibleText) {
      throw new Error(`Frontend editor did not select the complete editable paragraph: ${JSON.stringify({ paragraph, selection })}`)
    }
    // A real beforeinput event is targeted at the rendered paragraph containing
    // the current DOM selection and then bubbles through the contenteditable
    // editor. Target that visible node rather than manufacturing the event on the
    // outer host, while retaining the production Rust claim and render checks.
    await harness.action(layer, 'insertText', editableParagraphSelector, 'frontend line one')
    await harness.action(layer, 'press', editorInputSelector, 'Enter')
    await harness.action(layer, 'insertText', editableParagraphSelector, 'frontend line two')

    const deadline = Date.now() + 10_000
    let state = null
    while (Date.now() <= deadline) {
      state = await harness.action(layer, 'readState')
      if (expectedKeyboardResult.test(String(state?.markdown || ''))) break
      await sleep(50)
    }
    if (!expectedKeyboardResult.test(String(state?.markdown || ''))) {
      const compactState = {
        markdown: state?.markdown ?? null,
        markdownLength: String(state?.markdown || '').length,
        activeFile: state?.activeFile ?? null,
        editorRuntime: state?.editorRuntime ?? null,
        rustMirror: state?.rustMirror ?? null
      }
      throw new Error(`Keyboard selection/Enter/input did not produce the exact expected frontend Markdown: ${JSON.stringify(compactState)}`)
    }

    const persisted = await harness.waitForVaultFile('Frontend acceptance.md', (content) => expectedKeyboardResult.test(content))
    const displayed = await waitForDom(
      editorSelector,
      (value) => value?.text?.includes('frontend line one') && value?.text?.includes('frontend line two'),
      'Frontend keyboard result'
    )
    return { persistedBytes: persisted.length, visibleText: displayed.text }
  })

  await harness.runScenario('frontend-sidebar-visible-controls', layer, async() => {
    const toggle = '[data-testid="sidebar-toggle"]'
    const sidebar = '[data-testid="sidebar"]'
    await harness.action(layer, 'waitFor', toggle, 10_000)
    const before = await harness.action(layer, 'readDom', sidebar)
    await harness.action(layer, 'click', toggle)
    const after = await waitForDom(sidebar, (value) => value?.visible !== before?.visible, 'Sidebar toggle')
    await harness.action(layer, 'click', toggle)
    await waitForDom(sidebar, (value) => value?.visible === before?.visible, 'Sidebar restore')
    return { beforeVisible: before?.visible, toggledVisible: after?.visible }
  })

  await harness.runScenario('frontend-search-visible-results', layer, async() => {
    const searchButton = '[data-testid="global-search-button"]'
    const searchInput = '[data-testid="global-search-input"]'
    await harness.action(layer, 'click', searchButton)
    await harness.action(layer, 'waitFor', searchInput, 10_000)
    await harness.action(layer, 'insertText', searchInput, uniqueSearchText)
    const result = await waitForDom(
      '[data-testid="search-result"]',
      (value) => value?.visible && value?.text?.includes('Search target'),
      'Search result'
    )
    return { result: result.text }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Real packaged renderer driven through visible controls and browser input events; no internal editor/save commands.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) {
  console.error(failure?.stack || failure?.message || String(failure))
  process.exit(1)
}

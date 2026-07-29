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

const typeVisibleText = async(text) => {
  // The acceptance bridge dispatches one realm-local, cancelable beforeinput
  // event per character to the live contenteditable and waits for the matching
  // Rust transaction to be rendered before sending the next character. This is
  // the same visible Muya -> Rust input boundary as physical typing, while
  // preventing WebKit from outrunning asynchronous Rust renders and replacing
  // the focused descendants halfway through a word.
  await harness.action(layer, 'insertText', editorInputSelector, String(text))
}

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

    await typeVisibleText('frontend line one')
    await harness.action(layer, 'press', editorInputSelector, 'Enter')
    await typeVisibleText('frontend line two')

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
      (value) => value?.visible && value.text.includes('frontend line one') && value.text.includes('frontend line two'),
      'frontend-editor-visible-persistence'
    )
    return { persistedBytes: persisted.length, displayedTextBytes: displayed.text.length, selection }
  })

  await harness.runScenario('frontend-sidebar-toggle-roundtrip', layer, async() => {
    const before = await harness.action(layer, 'readDom', '.en-body')
    const beforeHidden = before.attributes.class?.includes('en-sidebar-hidden') === true
    await harness.action(layer, 'click', '.en-icon-rail__item[data-item-id="sidebar-toggle"]')
    const after = await harness.action(layer, 'readDom', '.en-body')
    const afterHidden = after.attributes.class?.includes('en-sidebar-hidden') === true
    if (beforeHidden === afterHidden) throw new Error('Visible sidebar control did not change the layout state.')
    await harness.action(layer, 'click', '.en-icon-rail__item[data-item-id="sidebar-toggle"]')
    const restored = await harness.action(layer, 'readDom', '.en-body')
    const restoredHidden = restored.attributes.class?.includes('en-sidebar-hidden') === true
    if (restoredHidden !== beforeHidden) throw new Error('Visible sidebar control did not restore the original layout state.')
    return { beforeHidden, afterHidden, restoredHidden }
  })

  await harness.runScenario('frontend-search-visible-result', layer, async() => {
    await harness.action(layer, 'click', '.en-icon-rail__item[data-item-id="search"]')
    await harness.action(layer, 'waitFor', '[data-testid="search-input"]', 10_000)
    await harness.action(layer, 'fill', '[data-testid="search-input"]', uniqueSearchText)
    const result = await waitForDom(
      '[data-testid="search-results"]',
      (value) => value?.visible && value.text.includes('Search target'),
      'frontend-search-results'
    )
    return { text: result.text }
  })
} catch (error) {
  failure = error
} finally {
  await harness.finish({ failure })
}

if (failure) throw failure

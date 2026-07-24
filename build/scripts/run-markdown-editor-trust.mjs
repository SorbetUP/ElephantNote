#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createRealAppHarness } from './lib/real-app-harness.mjs'

const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const notePath = 'Markdown trust.md'
const layer = 'frontend'
const harness = createRealAppHarness({
  suite: 'markdown-editor',
  buildRenderer: true,
  initialFiles: {
    [notePath]: '# Markdown trust\n\nInitial\n'
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const normalize = (value) => String(value || '').replace(/\r\n/g, '\n')

const startChild = () => harness.start()
const stopChild = () => harness.stop()

const frontendCommands = new Set([
  'insertText',
  'logs',
  'press',
  'readDom',
  'readState',
  'selectText',
  'waitFor',
  'waitUntilGone'
])

const command = async(commandName, ...args) => {
  if (frontendCommands.has(commandName)) return harness.action(layer, commandName, ...args)
  return harness.setup(commandName, ...args)
}

const visibleWords = (markdown) => normalize(markdown)
  .split('\n')
  .filter((line) => !/^\s*```/.test(line))
  .map((line) => line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, ''))
  .join(' ')
  .match(/\S+/g) || []

const waitForRenderedMarkdown = async(markdown, label, timeoutMs = 10_000) => {
  const expectedWords = visibleWords(markdown)
  const deadline = Date.now() + timeoutMs
  let previousText = null
  let stableReads = 0
  let last = null

  while (Date.now() <= deadline) {
    const state = await command('readState')
    const editor = await command('readDom', editorSelector)
    const actualWords = visibleWords(editor?.text || '')
    const stateContainsInput = normalize(state?.markdown).includes(normalize(markdown))
    const wordsMatch = JSON.stringify(actualWords) === JSON.stringify(expectedWords)

    if (editor?.visible && stateContainsInput && wordsMatch) {
      stableReads = previousText === editor.text ? stableReads + 1 : 1
      previousText = editor.text
      if (stableReads >= 2) return { state, editor, expectedWords, actualWords }
    } else {
      stableReads = 0
      previousText = editor?.text || null
    }
    last = { state, editor, expectedWords, actualWords }
    await sleep(50)
  }

  throw new Error(`${label}: renderer did not finish the real Markdown remount: ${JSON.stringify(last)}`)
}

const editorTextBounds = (text) => {
  const value = String(text || '')
  const leading = value.match(/^\s*/)?.[0].length || 0
  const end = value.trimEnd().length
  return { leading, end: Math.max(leading, end) }
}

const setMarkdownAndCaret = async(markdown, position = 'end') => {
  await command('setMarkdown', markdown)
  const synchronized = await waitForRenderedMarkdown(markdown, 'set-markdown-and-caret')
  const bounds = editorTextBounds(synchronized.editor.text)
  const requestedOffset = position === 'end' ? bounds.end : bounds.leading + Number(position)
  const offset = Math.max(bounds.leading, Math.min(bounds.end, requestedOffset))
  const selection = await command('selectText', editorSelector, offset, offset)
  if (selection?.start !== offset || selection?.end !== offset) {
    throw new Error(`set-markdown-and-caret selected the wrong caret: ${JSON.stringify({ markdown, position, offset, bounds, selection })}`)
  }
  return synchronized.editor
}

const waitForMarkdown = async(predicate, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let state = null
  while (Date.now() <= deadline) {
    state = await command('readState')
    if (predicate(normalize(state?.markdown), state)) return state
    await sleep(50)
  }
  throw new Error(`${label}: Markdown state did not reach the expected value: ${JSON.stringify(state)}`)
}

const assertNoCodeBlock = async(label) => {
  const codeBlocks = await command('queryAll', '[data-elephant-editor-kind="code_block"]')
  if (codeBlocks.length !== 0) {
    throw new Error(`${label}: unexpected code block appeared: ${JSON.stringify(codeBlocks)}`)
  }
}

const waitForDisk = (predicate, timeoutMs = 15_000) => harness.waitForVaultFile(notePath, (content) => predicate(normalize(content)), timeoutMs)

let failure = null
let finalMarkdown = ''
try {
  await startChild()

  await harness.runScenario('app-starts', layer, async() => {
    await command('selectVault', harness.vaultRoot)
    const opened = await command('openNote', notePath)
    const editor = await command('waitFor', editorSelector, 10_000)
    if (!opened?.rustEditorPresent || opened?.codeMirrorPresent || !editor?.visible) {
      throw new Error(`Real editor surface is incomplete: ${JSON.stringify({ opened, editor })}`)
    }
    await command('clearLogs')
    return { opened, editor }
  })

  await harness.runScenario('plain-return', layer, async() => {
    await setMarkdownAndCaret('alpha')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('alpha') && markdown.includes('beta') && /alpha[\s\S]*\nbeta/.test(markdown),
      'plain-return'
    )
    if (normalize(state.markdown).includes('```')) throw new Error(`plain-return created a code fence: ${state.markdown}`)
    await assertNoCodeBlock('plain-return')
    const diskBeforeExplicitSave = await waitForDisk((content) => content.includes('alpha') && content.includes('beta'))
    await command('save')
    const disk = await command('readNote', notePath)
    if (!normalize(disk.content).includes('alpha') || !normalize(disk.content).includes('beta')) {
      throw new Error(`plain-return was not persisted: ${JSON.stringify(disk)}`)
    }
    return { markdown: state.markdown, autosavedDisk: diskBeforeExplicitSave, explicitSaveDisk: disk.content }
  })

  await harness.runScenario('cursor-middle-return', layer, async() => {
    await setMarkdownAndCaret('alphomega', 4)
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown(
      (markdown) => /alph[\s\S]*beta[\s\S]*omega/.test(markdown) && markdown.includes('\n'),
      'cursor-middle-return'
    )
    await assertNoCodeBlock('cursor-middle-return')
    return { markdown: state.markdown }
  })

  await harness.runScenario('arrow-cursor-return', layer, async() => {
    await setMarkdownAndCaret('prefixsuffix')
    for (let index = 0; index < 6; index += 1) await command('press', editorSelector, 'ArrowLeft')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'middle')
    const state = await waitForMarkdown(
      (markdown) => /prefix[\s\S]*middle[\s\S]*suffix/.test(markdown) && markdown.includes('\n'),
      'arrow-cursor-return'
    )
    await assertNoCodeBlock('arrow-cursor-return')
    return { markdown: state.markdown }
  })

  await harness.runScenario('selection-replace', layer, async() => {
    await command('setMarkdown', 'alpha omega')
    const synchronized = await waitForRenderedMarkdown('alpha omega', 'selection-replace-setup')
    const selectionStart = String(synchronized.editor.text || '').indexOf('omega')
    if (selectionStart < 0) throw new Error(`selection-replace could not locate visible omega: ${JSON.stringify(synchronized.editor)}`)
    const selection = await command('selectText', editorSelector, selectionStart, selectionStart + 'omega'.length)
    if (selection.text !== 'omega') throw new Error(`selection-replace selected the wrong text: ${JSON.stringify(selection)}`)
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown((markdown) => markdown.trim() === 'alpha beta', 'selection-replace')
    await assertNoCodeBlock('selection-replace')
    return { markdown: state.markdown, synchronizedText: synchronized.editor.text, selection }
  })

  await harness.runScenario('multiline-insert', layer, async() => {
    await setMarkdownAndCaret('before')
    await command('insertText', editorSelector, '\nline-one\nline-two')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('before') && markdown.includes('line-one') && markdown.includes('line-two') && (markdown.match(/\n/g) || []).length >= 2,
      'multiline-insert'
    )
    if (normalize(state.markdown).includes('```')) throw new Error(`multiline-insert created a code fence: ${state.markdown}`)
    await assertNoCodeBlock('multiline-insert')
    return { markdown: state.markdown }
  })

  await harness.runScenario('inline-code-boundary-return', layer, async() => {
    await setMarkdownAndCaret('before `code`')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'plain')
    const state = await waitForMarkdown(
      (markdown) => /before `code`\s*\nplain(?:\n|$)/.test(markdown),
      'inline-code-boundary-return'
    )
    const markdown = normalize(state.markdown)
    if ((markdown.match(/`/g) || []).length !== 2) {
      throw new Error(`inline-code-boundary-return changed inline-code delimiters: ${markdown}`)
    }
    await assertNoCodeBlock('inline-code-boundary-return')
    return { markdown }
  })

  await harness.runScenario('list-return', layer, async() => {
    await setMarkdownAndCaret('- first')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'second')
    const state = await waitForMarkdown((markdown) => /(^|\n)- first\s*\n- second(\n|$)/.test(markdown), 'list-return')
    await assertNoCodeBlock('list-return')
    return { markdown: state.markdown }
  })

  await harness.runScenario('empty-list-exit', layer, async() => {
    await setMarkdownAndCaret('- first')
    await command('press', editorSelector, 'Enter')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'plain')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('- first') && markdown.includes('plain') && !/(^|\n)- plain(\n|$)/.test(markdown),
      'empty-list-exit'
    )
    await assertNoCodeBlock('empty-list-exit')
    return { markdown: state.markdown }
  })

  await harness.runScenario('code-boundary-return', layer, async() => {
    const initial = '# Boundary\n\n```js\nconst value = 1\n```\n\noutside'
    await setMarkdownAndCaret(initial)
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'tail')
    const state = await waitForMarkdown((markdown) => markdown.includes('outside') && markdown.includes('tail'), 'code-boundary-return')
    const markdown = normalize(state.markdown)
    const fences = markdown.match(/```/g) || []
    const codeBlocks = await command('queryAll', '[data-elephant-editor-kind="code_block"]')
    if (fences.length !== 2 || codeBlocks.length !== 1 || markdown.lastIndexOf('tail') < markdown.lastIndexOf('```')) {
      throw new Error(`Caret escaped into code formatting: ${JSON.stringify({ markdown, fences: fences.length, codeBlocks })}`)
    }
    return { markdown, codeBlockCount: codeBlocks.length }
  })

  await harness.runScenario('return-stress-no-crash', layer, async() => {
    await setMarkdownAndCaret('stress-start')
    for (let index = 1; index <= 12; index += 1) {
      await command('press', editorSelector, 'Enter')
      await command('insertText', editorSelector, `line-${index}`)
    }
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('line-1') && markdown.includes('line-12'),
      'return-stress-no-crash',
      15_000
    )
    const editor = await command('readDom', editorSelector)
    const errors = await command('logs', { level: 'error', limit: 5000 })
    if (!editor?.visible || errors.length !== 0) {
      throw new Error(`Return stress produced a crash or logged error: ${JSON.stringify({ editor, errors })}`)
    }
    const disk = await waitForDisk((content) => content.includes('line-1') && content.includes('line-12'))
    const latestState = await command('readState')
    finalMarkdown = normalize(latestState.markdown)
    if (normalize(disk) !== finalMarkdown) {
      throw new Error(`Autosaved Markdown differs from the real editor state: ${JSON.stringify({ finalMarkdown, disk })}`)
    }
    return { markdown: finalMarkdown, editor, errorCount: errors.length }
  })

  await harness.runScenario('restart-persistence', layer, async() => {
    await stopChild()
    await startChild()
    await command('selectVault', harness.vaultRoot)
    await command('openNote', notePath)
    const state = await waitForMarkdown((markdown) => markdown === finalMarkdown, 'restart-persistence', 15_000)
    const synchronized = await waitForRenderedMarkdown(finalMarkdown, 'restart-persistence-render', 15_000)
    const disk = normalize(readFileSync(`${harness.vaultRoot}/${notePath}`, 'utf8'))
    const errors = await command('logs', { level: 'error', limit: 5000 })
    if (disk !== finalMarkdown || !synchronized.editor?.visible || errors.length !== 0) {
      throw new Error(`Restart persistence failed: ${JSON.stringify({ state, disk, synchronized, errors })}`)
    }
    return { markdown: state.markdown, disk, editor: synchronized.editor, errorCount: errors.length }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Real packaged Tauri renderer, synchronized real Rust editor remounts, keyboard/input events, autosave to disk, process restart and renderer error logs.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) throw failure

import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  setJsSelectionByAnyText,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const selectParagraph = (muya, value) => setJsSelectionByText(muya, value, 1)
const selectAny = (muya, value) => setJsSelectionByAnyText(muya, value, 1)

const cases = [
  {
    name: 'paragraph to blockquote',
    initial: 'alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('blockquote')
  },
  {
    name: 'blockquote to paragraph',
    initial: '> alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('blockquote')
  },
  {
    name: 'paragraph to bullet list',
    initial: 'alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ul-bullet')
  },
  {
    name: 'paragraph to task list',
    initial: 'alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ul-task')
  },
  {
    name: 'paragraph to ordered list',
    initial: 'alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ol-order')
  },
  {
    name: 'bullet list to task list',
    initial: '- alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ul-task')
  },
  {
    name: 'task list to ordered list',
    initial: '- [x] alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ol-order')
  },
  {
    name: 'ordered list to bullet list',
    initial: '1. alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('ul-bullet')
  },
  {
    name: 'paragraph to fenced code',
    initial: 'alpha',
    target: 'alpha',
    select: selectParagraph,
    action: (muya) => muya.updateParagraph('pre')
  },
  {
    name: 'fenced code back to paragraph',
    initial: '```\nalpha\n```',
    target: 'alpha',
    select: selectAny,
    action: (muya) => muya.updateParagraph('pre')
  }
]

describeBundled('Muya block type characterization', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      jsEditor = await createJsEditor(testCase.initial)
      testCase.select(jsEditor, testCase.target)
      await testCase.action(jsEditor)
      await settle()
      const result = {
        markdown: jsEditor.getMarkdown(),
        cursor: jsEditor.contentState.cursor
      }
      console.log('[muya-block-type]', testCase.name, JSON.stringify(result))
      expect(typeof result.markdown).toBe('string')
    })
  }
})

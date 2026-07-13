import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  setJsSelection,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const cases = [
  {
    name: 'insert a horizontal rule after non-empty text',
    initial: 'alpha',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 2)
  },
  {
    name: 'replace an empty paragraph with a horizontal rule',
    initial: '',
    select: (muya) => setJsSelection(muya, 0, 0)
  }
]

describeBundled('Muya horizontal rule characterization', () => {
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
      testCase.select(jsEditor)
      jsEditor.updateParagraph('hr')
      await settle()
      console.log(
        '[muya-horizontal-rule]',
        testCase.name,
        JSON.stringify({
          markdown: jsEditor.getMarkdown(),
          cursor: jsEditor.contentState.cursor
        })
      )
      expect(typeof jsEditor.getMarkdown()).toBe('string')
    })
  }
})

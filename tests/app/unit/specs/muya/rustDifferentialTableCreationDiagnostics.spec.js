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
    name: 'create a 2x2 table in an empty document',
    initial: '',
    select: (muya) => setJsSelection(muya, 0, 0)
  },
  {
    name: 'create a 2x2 table after a non-empty paragraph',
    initial: 'alpha',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 2)
  }
]

describeBundled('Muya table creation characterization', () => {
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
      jsEditor.createTable({ rows: 2, columns: 2 })
      await settle()
      const result = {
        markdown: jsEditor.getMarkdown(),
        cursor: jsEditor.contentState.cursor
      }
      console.log('[muya-table-create]', testCase.name, JSON.stringify(result))
      expect(typeof result.markdown).toBe('string')
    })
  }
})

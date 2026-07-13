import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const cases = [
  {
    name: 'duplicate a paragraph block',
    initial: 'alpha\n\nbeta',
    target: 'alpha',
    run: (muya) => muya.duplicate()
  },
  {
    name: 'duplicate a heading block',
    initial: '# alpha\n\nbeta',
    target: 'alpha',
    run: (muya) => muya.duplicate()
  },
  {
    name: 'duplicate an entire nested list root',
    initial: '- parent\n  - child\n\nafter',
    target: 'child',
    run: (muya) => muya.duplicate()
  },
  {
    name: 'delete a middle paragraph and select the next block',
    initial: 'before\n\nalpha\n\nafter',
    target: 'alpha',
    run: (muya) => muya.deleteParagraph()
  },
  {
    name: 'delete the final paragraph and select the previous block',
    initial: 'before\n\nalpha',
    target: 'alpha',
    run: (muya) => muya.deleteParagraph()
  },
  {
    name: 'delete the only paragraph and create an empty replacement',
    initial: 'alpha',
    target: 'alpha',
    run: (muya) => muya.deleteParagraph()
  },
  {
    name: 'insert a new paragraph after the selected root block',
    initial: 'alpha\n\nbeta',
    target: 'alpha',
    run: (muya) => muya.insertParagraph('after', '', true)
  },
  {
    name: 'insert a new root paragraph after a nested list',
    initial: '- parent\n  - child\n\nafter',
    target: 'child',
    run: (muya) => muya.insertParagraph('after', '', true)
  }
]

describeBundled('Muya paragraph menu characterization', () => {
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
      setJsSelectionByText(jsEditor, testCase.target, 1)
      await testCase.run(jsEditor)
      await settle()
      const result = {
        markdown: jsEditor.getMarkdown(),
        cursor: jsEditor.contentState.cursor
      }
      console.log('[muya-paragraph-menu]', testCase.name, JSON.stringify(result))
      expect(typeof result.markdown).toBe('string')
    })
  }
})

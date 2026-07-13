import { afterEach, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  setJsSelection,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip
const cases = [
  {
    name: 'strike from inside strong through inside emphasis',
    initial: '**alpha** beta *gamma*',
    start: 4,
    end: 19,
    format: 'del'
  },
  {
    name: 'emphasis from plain text through inside strong',
    initial: 'alpha **beta** gamma',
    start: 2,
    end: 10,
    format: 'em'
  }
]

describeBundled('Muya partial cross-wrapper mark diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor(testCase.initial)
      setJsSelection(editor, 0, testCase.start, testCase.end)
      editor.format(testCase.format)
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-partial-mark]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

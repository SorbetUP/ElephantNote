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
    name: 'toggle emphasis inside the start fragment of linked emphasis',
    initial: 'alpha **beta** gamma',
    first: { start: 2, end: 10, format: 'em' },
    second: { start: 4, end: 6, format: 'em' }
  },
  {
    name: 'toggle emphasis across part of linked emphasis',
    initial: 'alpha **beta** gamma',
    first: { start: 2, end: 10, format: 'em' },
    second: { start: 4, end: 13, format: 'em' }
  },
  {
    name: 'toggle strike inside the start fragment of linked strike',
    initial: '**alpha** beta *gamma*',
    first: { start: 4, end: 19, format: 'del' },
    second: { start: 7, end: 9, format: 'del' }
  }
]

describeBundled('Muya same-mark linked-group diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor(testCase.initial)
      setJsSelection(editor, 0, testCase.first.start, testCase.first.end)
      editor.format(testCase.first.format)
      await settle()
      const linked = editor.getMarkdown()

      setJsSelection(editor, 0, testCase.second.start, testCase.second.end)
      editor.format(testCase.second.format)
      await settle()
      const markdown = editor.getMarkdown()

      console.log('[muya-linked-group-same-mark]', JSON.stringify({ ...testCase, linked, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

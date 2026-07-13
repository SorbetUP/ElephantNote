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
    name: 'apply strike across part of an existing linked emphasis group',
    initial: 'alpha **beta** gamma',
    first: { start: 2, end: 10, format: 'em' },
    second: { start: 4, end: 13, format: 'del' }
  },
  {
    name: 'apply strong inside the start fragment of linked emphasis',
    initial: 'alpha **beta** gamma',
    first: { start: 2, end: 10, format: 'em' },
    second: { start: 3, end: 6, format: 'strong' }
  }
]

describeBundled('Muya linked-group edit diagnostics', () => {
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

      console.log('[muya-linked-group-edit]', JSON.stringify({ ...testCase, linked, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

import { afterEach, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  setJsSelection,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const clipboardEvent = (text, html = '') => ({
  preventDefault: () => {},
  stopPropagation: () => {},
  clipboardData: {
    getData: (type) => {
      if (type === 'text/plain') return text
      if (type === 'text/html') return html
      return ''
    }
  }
})

const cases = [
  {
    name: 'paste plain text at a collapsed caret',
    initial: 'alpha',
    selection: [2, 2],
    text: 'XYZ',
    html: ''
  },
  {
    name: 'replace a selected range with plain text',
    initial: 'alpha',
    selection: [1, 4],
    text: 'X',
    html: ''
  },
  {
    name: 'paste multiline Markdown between existing text',
    initial: 'alpha',
    selection: [2, 2],
    text: 'one\n\ntwo',
    html: ''
  },
  {
    name: 'paste semantic HTML into a paragraph',
    initial: 'alpha',
    selection: [2, 2],
    text: 'bold and soft',
    html: '<p><strong>bold</strong> and <em>soft</em></p>'
  }
]

describeBundled('Muya paste diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor(testCase.initial)
      setJsSelection(editor, 0, testCase.selection[0], testCase.selection[1])
      await editor.contentState.pasteHandler(
        clipboardEvent(testCase.text, testCase.html),
        'normal',
        testCase.text,
        testCase.html || undefined
      )
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-paste]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

import { afterEach, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const clipboardEvent = (text) => ({
  preventDefault: () => {},
  stopPropagation: () => {},
  clipboardData: {
    getData: (type) => (type === 'text/plain' ? text : '')
  }
})

const cases = [
  {
    name: 'paste plain text inside a list item',
    initial: '- alpha',
    target: 'alpha',
    offset: 2,
    pasted: 'XYZ'
  },
  {
    name: 'paste multiline Markdown inside a list item',
    initial: '- alpha',
    target: 'alpha',
    offset: 2,
    pasted: 'one\n\ntwo'
  },
  {
    name: 'paste plain text inside a table cell',
    initial: '| A | B |\n| --- | --- |\n| alpha | beta |',
    target: 'alpha',
    offset: 2,
    pasted: 'XYZ'
  },
  {
    name: 'paste multiline Markdown inside a table cell',
    initial: '| A | B |\n| --- | --- |\n| alpha | beta |',
    target: 'alpha',
    offset: 2,
    pasted: 'one\n\ntwo'
  },
  {
    name: 'paste plain text inside a blockquote',
    initial: '> alpha',
    target: 'alpha',
    offset: 2,
    pasted: 'XYZ'
  },
  {
    name: 'paste multiline Markdown inside a blockquote',
    initial: '> alpha',
    target: 'alpha',
    offset: 2,
    pasted: 'one\n\ntwo'
  }
]

describeBundled('Muya nested paste diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor(testCase.initial)
      setJsSelectionByText(editor, testCase.target, testCase.offset)
      await editor.contentState.pasteHandler(
        clipboardEvent(testCase.pasted),
        'normal',
        testCase.pasted
      )
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-nested-paste]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

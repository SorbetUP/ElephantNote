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
    name: 'paste a list inside a list item',
    initial: '- alpha',
    target: 'alpha',
    pasted: '- one\n- two'
  },
  {
    name: 'paste a code block inside a list item',
    initial: '- alpha',
    target: 'alpha',
    pasted: '```js\nconsole.log(1)\n```'
  },
  {
    name: 'paste a list inside a table cell',
    initial: '| A | B |\n| --- | --- |\n| alpha | beta |',
    target: 'alpha',
    pasted: '- one\n- two'
  },
  {
    name: 'paste a code block inside a table cell',
    initial: '| A | B |\n| --- | --- |\n| alpha | beta |',
    target: 'alpha',
    pasted: '```js\nconsole.log(1)\n```'
  },
  {
    name: 'paste a list inside a blockquote',
    initial: '> alpha',
    target: 'alpha',
    pasted: '- one\n- two'
  },
  {
    name: 'paste a heading inside a blockquote',
    initial: '> alpha',
    target: 'alpha',
    pasted: '# Title'
  }
]

describeBundled('Muya nested structured paste diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor(testCase.initial)
      setJsSelectionByText(editor, testCase.target, 2)
      await editor.contentState.pasteHandler(
        clipboardEvent(testCase.pasted),
        'normal',
        testCase.pasted
      )
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-nested-structured-paste]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

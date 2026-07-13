import { afterEach, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  setJsSelection,
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
    name: 'paste a heading into paragraph text',
    markdown: '# Title'
  },
  {
    name: 'paste a blockquote into paragraph text',
    markdown: '> quote'
  },
  {
    name: 'paste a list into paragraph text',
    markdown: '- one\n- two'
  },
  {
    name: 'paste a fenced code block into paragraph text',
    markdown: '```js\nconsole.log(1)\n```'
  },
  {
    name: 'paste a table into paragraph text',
    markdown: '| A | B |\n| --- | --- |\n| one | two |'
  },
  {
    name: 'paste a Markdown image into paragraph text',
    markdown: '![alt](image.png)'
  }
]

describeBundled('Muya structured paste diagnostics', () => {
  let editor = null

  afterEach(() => {
    editor?.destroy?.()
    editor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      editor = await createJsEditor('alpha')
      setJsSelection(editor, 0, 2, 2)
      await editor.contentState.pasteHandler(
        clipboardEvent(testCase.markdown),
        'normal',
        testCase.markdown
      )
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-structured-paste]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

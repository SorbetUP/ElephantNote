import { afterEach, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  setJsSelection,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const clipboardEvent = (text, html) => ({
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
    name: 'paste an unordered HTML list',
    text: 'one\ntwo',
    html: '<ul><li>one</li><li>two</li></ul>'
  },
  {
    name: 'paste an ordered HTML list',
    text: 'one\ntwo',
    html: '<ol><li>one</li><li>two</li></ol>'
  },
  {
    name: 'paste an HTML blockquote',
    text: 'quote',
    html: '<blockquote><p>quote</p></blockquote>'
  },
  {
    name: 'paste an HTML preformatted code block',
    text: 'console.log(1)',
    html: '<pre><code class="language-js">console.log(1)</code></pre>'
  },
  {
    name: 'paste an HTML table',
    text: 'A\tB\none\ttwo',
    html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>one</td><td>two</td></tr></tbody></table>'
  },
  {
    name: 'paste an HTML image',
    text: 'alt',
    html: '<p><img src="image.png" alt="alt"></p>'
  }
]

describeBundled('Muya structured HTML paste diagnostics', () => {
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
        clipboardEvent(testCase.text, testCase.html),
        'normal',
        testCase.text,
        testCase.html
      )
      await settle()
      const markdown = editor.getMarkdown()
      console.log('[muya-structured-html-paste]', JSON.stringify({ ...testCase, markdown }))
      expect(markdown.length).toBeGreaterThan(0)
    })
  }
})

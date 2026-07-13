import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelectionByAnyText,
  setJsSelectionByText
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const cases = [
  {
    name: 'infer alt text and encode a local path at a collapsed caret',
    initial: 'alpha',
    expected: 'al![my image](/tmp/my%20image.png)pha\n',
    selectJs: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    selectRust: (rust) => rust.setSelectionByText('alpha', 2),
    image: { source: '/tmp/my image.png', alt: '', title: null }
  },
  {
    name: 'use selected text as image alt text',
    initial: 'alpha',
    expected: 'a![lph](https://example.com/a.png)a\n',
    selectJs: (muya) => setJsSelectionByText(muya, 'alpha', 1, 4),
    selectRust: (rust) => rust.setSelectionByText('alpha', 1, 4),
    image: { source: 'https://example.com/a.png', alt: '', title: null }
  },
  {
    name: 'preserve explicit alt text and title',
    initial: 'alpha',
    expected: 'al![diagram](https://example.com/a%20b.png "Example image")pha\n',
    selectJs: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    selectRust: (rust) => rust.setSelectionByText('alpha', 2),
    image: {
      source: 'https://example.com/a b.png',
      alt: 'diagram',
      title: 'Example image'
    }
  },
  {
    name: 'insert an image inside strong text',
    initial: '**alpha**',
    expected: '**al![picture](/tmp/picture.png)pha**\n',
    selectJs: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    selectRust: (rust) => rust.setSelectionByText('alpha', 2),
    image: { source: '/tmp/picture.png', alt: '', title: null }
  },
  {
    name: 'reject image insertion inside fenced code',
    initial: '```\nalpha\n```',
    expected: '```\nalpha\n```\n',
    selectJs: (muya) => setJsSelectionByAnyText(muya, 'alpha', 2),
    selectRust: (rust) => rust.setSelectionByText('alpha', 2),
    image: { source: '/tmp/picture.png', alt: '', title: null }
  }
]

const jsImage = ({ source, alt, title }) => ({ src: source, alt, title: title || '' })

describeBundled('Muya image insertion differential traces', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const result = await runDifferentialTrace({
        initial: testCase.initial,
        runJs: (muya) => {
          testCase.selectJs(muya)
          muya.insertImage(jsImage(testCase.image))
        },
        runRust: (rust) => {
          testCase.selectRust(rust)
          rust.request({ type: 'insert_image', ...testCase.image })
        }
      })
      jsEditor = result.jsEditor
      expect(result.jsMarkdown).toBe(result.rustMarkdown)
      expect(result.rustMarkdown).toBe(testCase.expected)
    })
  }

  it('undoes and redoes image insertion atomically', async () => {
    const changed = 'al![picture](/tmp/picture.png)pha\n'
    const result = await runDifferentialTrace({
      initial: 'alpha',
      runJs: (muya) => {
        setJsSelectionByText(muya, 'alpha', 2)
        muya.insertImage({ src: '/tmp/picture.png' })
        const afterInsert = muya.getMarkdown()
        muya.undo()
        const afterUndo = muya.getMarkdown()
        muya.redo()
        return [afterInsert, afterUndo, muya.getMarkdown()]
      },
      runRust: (rust) => {
        rust.setSelectionByText('alpha', 2)
        rust.request({
          type: 'insert_image',
          source: '/tmp/picture.png',
          alt: '',
          title: null
        })
        const afterInsert = rust.markdown()
        rust.request({ type: 'undo' })
        const afterUndo = rust.markdown()
        rust.request({ type: 'redo' })
        return [afterInsert, afterUndo, rust.markdown()]
      }
    })
    jsEditor = result.jsEditor
    expect(result.jsResult).toEqual(result.rustResult)
    expect(result.rustResult).toEqual([changed, 'alpha\n', changed])
  })
})

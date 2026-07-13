import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  setJsSelectionByAnyText,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const cases = [
  {
    name: 'infer alt text and encode a local path at a collapsed caret',
    initial: 'alpha',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    image: { src: '/tmp/my image.png' }
  },
  {
    name: 'use selected text as image alt text',
    initial: 'alpha',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 1, 4),
    image: { src: 'https://example.com/a.png' }
  },
  {
    name: 'preserve explicit alt text and title',
    initial: 'alpha',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    image: { src: 'https://example.com/a b.png', alt: 'diagram', title: 'Example image' }
  },
  {
    name: 'insert an image inside strong text',
    initial: '**alpha**',
    select: (muya) => setJsSelectionByText(muya, 'alpha', 2),
    image: { src: '/tmp/picture.png' }
  },
  {
    name: 'reject image insertion inside fenced code',
    initial: '```\nalpha\n```',
    select: (muya) => setJsSelectionByAnyText(muya, 'alpha', 2),
    image: { src: '/tmp/picture.png' }
  }
]

describeBundled('Muya image insertion characterization', () => {
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
      testCase.select(jsEditor)
      jsEditor.insertImage(testCase.image)
      await settle()
      const result = {
        markdown: jsEditor.getMarkdown(),
        cursor: jsEditor.contentState.cursor
      }
      console.log('[muya-image-insert]', testCase.name, JSON.stringify(result))
      expect(typeof result.markdown).toBe('string')
    })
  }
})

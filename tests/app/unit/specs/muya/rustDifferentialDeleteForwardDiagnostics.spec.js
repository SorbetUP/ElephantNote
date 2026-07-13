import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  fakeKeyEvent,
  initializeRustWasm,
  setJsSelection,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const deleteForward = async (muya) => {
  const event = fakeKeyEvent({ key: 'Delete', code: 'Delete', keyCode: 46, which: 46 })
  const handler = muya.contentState.deleteHandler
  if (typeof handler !== 'function') {
    throw new Error('Muya deleteHandler is unavailable.')
  }
  await handler.call(muya.contentState, event)
}

const cases = [
  { name: 'ASCII scalar', initial: 'alpha', textIndex: 0, start: 2 },
  { name: 'UTF-16 emoji', initial: 'A😀B', textIndex: 0, start: 1 },
  { name: 'selected range', initial: 'alpha', textIndex: 0, start: 1, end: 3 },
  { name: 'paragraph boundary', initial: 'left\n\nright', textIndex: 0, start: 4 },
  { name: 'final paragraph end', initial: 'alpha', textIndex: 0, start: 5 }
]

describeBundled('Muya delete-forward characterization', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  it('exposes the delete handler contract', async () => {
    jsEditor = await createJsEditor('alpha')
    console.log('[muya-delete-handler-source]', String(jsEditor.contentState.deleteHandler))
    expect(typeof jsEditor.contentState.deleteHandler).toBe('function')
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      jsEditor = await createJsEditor(testCase.initial)
      setJsSelection(
        jsEditor,
        testCase.textIndex,
        testCase.start,
        testCase.end ?? testCase.start
      )
      await deleteForward(jsEditor)
      await settle()
      const markdown = jsEditor.getMarkdown()
      console.log('[muya-delete-forward]', testCase.name, JSON.stringify(markdown))
      expect(typeof markdown).toBe('string')
    })
  }
})

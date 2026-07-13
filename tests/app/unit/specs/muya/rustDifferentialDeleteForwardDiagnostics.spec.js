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
  if (typeof muya.contentState.deleteHandler === 'function') {
    await muya.contentState.deleteHandler(event, 'forward')
    return
  }
  const target = document.activeElement || document.querySelector('[contenteditable="true"]')
  target?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Delete',
      code: 'Delete',
      keyCode: 46,
      which: 46,
      bubbles: true,
      cancelable: true
    })
  )
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

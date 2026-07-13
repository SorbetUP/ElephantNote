import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  fakeKeyEvent,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelection
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const backspaceTrace = (name, grapheme, expected) => ({
  name,
  initial: `A${grapheme}B`,
  expected,
  runJs: async (muya) => {
    setJsSelection(muya, 0, 1 + grapheme.length)
    muya.contentState.backspaceHandler(fakeKeyEvent())
  },
  runRust: (rust) => {
    rust.setSelection(0, 1 + grapheme.length)
    rust.request({ type: 'delete_backward' })
  }
})

const traces = [
  backspaceTrace('delete one astral emoji as one grapheme', '😀', 'AB\n'),
  backspaceTrace('delete one regional-indicator flag as one grapheme', '🇫🇷', 'AB\n'),
  backspaceTrace('delete one ZWJ family as one grapheme', '👨‍👩‍👧‍👦', 'AB\n'),
  backspaceTrace('delete one combining-accent grapheme', 'e\u0301', 'AB\n')
]

describeBundled('Muya UTF-16 differential traces', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const trace of traces) {
    it(trace.name, async () => {
      const result = await runDifferentialTrace(trace)
      jsEditor = result.jsEditor
      expect(result.jsMarkdown).toBe(result.rustMarkdown)
      expect(result.rustMarkdown).toBe(trace.expected)
    })
  }
})

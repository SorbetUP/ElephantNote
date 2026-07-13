import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelection
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip
const traces = [
  {
    name: 'undo and redo a strike crossing strong and emphasis wrappers',
    initial: '**alpha** beta *gamma*',
    expected: '**al~~pha** beta *gam~~ma*\n',
    checkpoints: [
      '**al~~pha** beta *gam~~ma*\n',
      '**alpha** beta *gamma*\n',
      '**al~~pha** beta *gam~~ma*\n'
    ],
    runJs: async (muya) => {
      setJsSelection(muya, 0, 4, 19)
      muya.format('del')
      const formatted = muya.getMarkdown()
      muya.undo()
      const undone = muya.getMarkdown()
      muya.redo()
      return [formatted, undone, muya.getMarkdown()]
    },
    runRust: (rust) => {
      rust.setSelectionBetweenText('alpha', 2, 'gamma', 3)
      rust.request({ type: 'toggle_strike' })
      const formatted = rust.markdown()
      rust.request({ type: 'undo' })
      const undone = rust.markdown()
      rust.request({ type: 'redo' })
      return [formatted, undone, rust.markdown()]
    }
  },
  {
    name: 'undo and redo emphasis crossing plain text and strong',
    initial: 'alpha **beta** gamma',
    expected: 'al*pha **be*ta** gamma\n',
    checkpoints: [
      'al*pha **be*ta** gamma\n',
      'alpha **beta** gamma\n',
      'al*pha **be*ta** gamma\n'
    ],
    runJs: async (muya) => {
      setJsSelection(muya, 0, 2, 10)
      muya.format('em')
      const formatted = muya.getMarkdown()
      muya.undo()
      const undone = muya.getMarkdown()
      muya.redo()
      return [formatted, undone, muya.getMarkdown()]
    },
    runRust: (rust) => {
      rust.setSelectionBetweenText('alpha ', 2, 'beta', 2)
      rust.request({ type: 'toggle_emphasis' })
      const formatted = rust.markdown()
      rust.request({ type: 'undo' })
      const undone = rust.markdown()
      rust.request({ type: 'redo' })
      return [formatted, undone, rust.markdown()]
    }
  }
]

describeBundled('Muya partial cross-wrapper mark history traces', () => {
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
      expect(result.jsResult).toEqual(result.rustResult)
      expect(result.rustResult).toEqual(trace.checkpoints)
    })
  }
})

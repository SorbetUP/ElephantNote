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
    name: 'strike from inside strong through inside emphasis',
    initial: '**alpha** beta *gamma*',
    expected: '**al~~pha** beta *gam~~ma*\n',
    edges: ['start', 'middle', 'end'],
    runJs: async (muya) => {
      setJsSelection(muya, 0, 4, 19)
      muya.format('del')
    },
    runRust: (rust) => {
      rust.setSelectionBetweenText('alpha', 2, 'gamma', 3)
      rust.request({ type: 'toggle_strike' })
      return rust
        .snapshot()
        .document.nodes
        .filter((node) => node.kind?.value?.type === 'mark_fragment')
        .map((node) => node.kind.value.edge)
    }
  },
  {
    name: 'emphasis from plain text through inside strong',
    initial: 'alpha **beta** gamma',
    expected: 'al*pha **be*ta** gamma\n',
    edges: ['start', 'end'],
    runJs: async (muya) => {
      setJsSelection(muya, 0, 2, 10)
      muya.format('em')
    },
    runRust: (rust) => {
      rust.setSelectionBetweenText('alpha ', 2, 'beta', 2)
      rust.request({ type: 'toggle_emphasis' })
      return rust
        .snapshot()
        .document.nodes
        .filter((node) => node.kind?.value?.type === 'mark_fragment')
        .map((node) => node.kind.value.edge)
    }
  }
]

describeBundled('Muya partial cross-wrapper mark differential traces', () => {
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
      expect(result.rustResult).toEqual(trace.edges)
    })
  }
})

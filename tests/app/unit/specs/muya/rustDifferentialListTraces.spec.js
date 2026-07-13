import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  fakeKeyEvent,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelectionByText
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip
const traces = [
  {
    name: 'indent a flat unordered item under its previous sibling',
    initial: '- parent\n- child',
    expected: '- parent\n  - child\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'child', 0)
      muya.contentState.tabHandler(fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelectionByText('child', 0)
      rust.request({ type: 'indent_list_item' })
    }
  },
  {
    name: 'reuse an existing nested unordered list when indenting',
    initial: '- parent\n  - first\n- second',
    expected: '- parent\n  - first\n  - second\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'second', 0)
      muya.contentState.tabHandler(fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelectionByText('second', 0)
      rust.request({ type: 'indent_list_item' })
    }
  },
  {
    name: 'outdent the only nested item and remove its empty list',
    initial: '- parent\n  - child\n- sibling',
    expected: '- parent\n- child\n- sibling\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'child', 0)
      muya.contentState.tabHandler(fakeKeyEvent({ shiftKey: true }))
    },
    runRust: (rust) => {
      rust.setSelectionByText('child', 0)
      rust.request({ type: 'outdent_list_item' })
    }
  },
  {
    name: 'outdent the final nested item while keeping its sibling nested',
    initial: '- parent\n  - first\n  - second',
    expected: '- parent\n  - first\n- second\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'second', 0)
      muya.contentState.tabHandler(fakeKeyEvent({ shiftKey: true }))
    },
    runRust: (rust) => {
      rust.setSelectionByText('second', 0)
      rust.request({ type: 'outdent_list_item' })
    }
  }
]

describeBundled('Muya nested-list differential traces', () => {
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

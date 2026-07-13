import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelectionByText
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip
const traces = [
  {
    name: 'insert a body row after the current table row',
    initial: '| A | B |\n| :--- | ---: |\n| one | two |',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'one', 0)
      muya.contentState.editTable({
        location: 'next',
        action: 'insert',
        target: 'row'
      })
    },
    runRust: (rust) => {
      rust.setSelectionByText('one', 0)
      rust.request({ type: 'insert_table_row_after' })
    }
  },
  {
    name: 'delete the current body row while preserving the next row',
    initial: '| A | B |\n| --- | --- |\n| one | two |\n| three | four |',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'one', 0)
      muya.contentState.editTable({
        location: 'current',
        action: 'delete',
        target: 'row'
      })
    },
    runRust: (rust) => {
      rust.setSelectionByText('one', 0)
      rust.request({ type: 'delete_table_row' })
    }
  },
  {
    name: 'insert a column after the current table column',
    initial: '| A | B |\n| :--- | ---: |\n| one | two |',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'one', 0)
      muya.contentState.editTable({
        location: 'next',
        action: 'insert',
        target: 'column'
      })
    },
    runRust: (rust) => {
      rust.setSelectionByText('one', 0)
      rust.request({ type: 'insert_table_column_after' })
    }
  },
  {
    name: 'delete the current table column across every row',
    initial: '| A | B | C |\n| --- | :---: | ---: |\n| one | two | three |',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'two', 0)
      muya.contentState.editTable({
        location: 'current',
        action: 'delete',
        target: 'column'
      })
    },
    runRust: (rust) => {
      rust.setSelectionByText('two', 0)
      rust.request({ type: 'delete_table_column' })
    }
  }
]

describeBundled('Muya table differential traces', () => {
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
    })
  }
})

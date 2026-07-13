import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelectionByAnyText,
  setJsSelectionByText,
  settle
} from './rustDifferentialHarness'
import {
  blockTypeCases,
  blockTypeHistoryCases
} from './rustDifferentialBlockTypeCases'

const describeBundled = bundled ? describe : describe.skip

const selectJs = (muya, target, anyText = false) => {
  const select = anyText ? setJsSelectionByAnyText : setJsSelectionByText
  select(muya, target, 1)
}

const updateJsParagraph = async (muya, paragraphType) => {
  await muya.updateParagraph(paragraphType)
  await settle()
}

describeBundled('Muya block type differential traces', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const [name, initial, target, paragraphType, expected, command, anyText] of blockTypeCases) {
    it(name, async () => {
      const result = await runDifferentialTrace({
        initial,
        runJs: async (muya) => {
          selectJs(muya, target, anyText)
          await updateJsParagraph(muya, paragraphType)
        },
        runRust: (rust) => {
          rust.setSelectionByText(target, 1)
          rust.request(command)
        }
      })
      jsEditor = result.jsEditor
      expect(result.jsMarkdown).toBe(result.rustMarkdown)
      expect(result.rustMarkdown).toBe(expected)
    })
  }

  for (const trace of blockTypeHistoryCases) {
    it(trace.name, async () => {
      const result = await runDifferentialTrace({
        initial: trace.initial,
        runJs: async (muya) => {
          selectJs(muya, trace.target)
          await updateJsParagraph(muya, trace.paragraphType)
          const changed = muya.getMarkdown()
          muya.undo()
          const undone = muya.getMarkdown()
          muya.redo()
          return [changed, undone, muya.getMarkdown()]
        },
        runRust: (rust) => {
          rust.setSelectionByText(trace.target, 1)
          rust.request(trace.command)
          const changed = rust.markdown()
          rust.request({ type: 'undo' })
          const undone = rust.markdown()
          rust.request({ type: 'redo' })
          return [changed, undone, rust.markdown()]
        }
      })
      jsEditor = result.jsEditor
      expect(result.jsResult).toEqual(result.rustResult)
      expect(result.rustResult).toEqual(trace.checkpoints)
    })
  }
})

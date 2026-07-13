import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import Muya from '../../../../../Elephant/frontend/src/muya/lib'
import initWasm, { MuyaEditor } from 'muya-rust-wasm-bundle'

const bundled = process.env.ELEPHANT_EXPERIMENTAL_RUST_EDITOR === '1'
const describeBundled = bundled ? describe : describe.skip
const settle = async () => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
}

const editableBlocks = (muya) => {
  const output = []
  const visit = (block) => {
    if (
      block?.functionType === 'paragraphContent' ||
      block?.functionType === 'cellContent'
    ) {
      output.push(block)
    }
    for (const child of block?.children || []) visit(child)
  }
  for (const block of muya.contentState.getBlocks()) visit(block)
  return output
}

const setJsSelection = (muya, textIndex, start, end = start) => {
  const block = editableBlocks(muya)[textIndex]
  if (!block) throw new Error(`Muya JS text block ${textIndex} was not found.`)
  muya.contentState.cursor = {
    start: { key: block.key, offset: start },
    end: { key: block.key, offset: end },
    isEdit: true
  }
  muya.contentState.setCursor()
}

const createJsEditor = async (markdown) => {
  document.body.innerHTML = '<div class="muya-differential-host"></div>'
  const muya = new Muya(document.querySelector('.muya-differential-host'), {
    markdown,
    t: (key) => key
  })
  await settle()
  return muya
}

class RustTraceEditor {
  constructor(markdown) {
    this.engine = new MuyaEditor(markdown)
    this.revision = 0
  }

  request(command) {
    const response = JSON.parse(
      this.engine.handle_json(
        JSON.stringify({
          protocol_version: 1,
          expected_revision: this.revision,
          command
        })
      )
    )
    if (response.type === 'error') {
      throw new Error(`${response.payload.code}: ${response.payload.message}`)
    }
    if (response.type === 'update') this.revision = response.payload.revision
    if (response.type === 'snapshot') this.revision = response.payload.revision
    return response.payload
  }

  snapshot() {
    const response = JSON.parse(this.engine.snapshot_json())
    if (response.type !== 'snapshot') throw new Error(`Expected snapshot, got ${response.type}.`)
    this.revision = response.payload.revision
    return response.payload
  }

  textNodes() {
    return this
      .snapshot()
      .document.nodes.filter(
        (node) => node.kind?.layer === 'inline' && node.kind?.value?.type === 'text'
      )
  }

  setSelection(textIndex, start, end = start) {
    const node = this.textNodes()[textIndex]
    if (!node) throw new Error(`Muya Rust text node ${textIndex} was not found.`)
    this.request({
      type: 'set_selection',
      selection: {
        anchor: { node: node.id, offset_utf16: start },
        focus: { node: node.id, offset_utf16: end }
      }
    })
  }

  markdown() {
    return this.snapshot().markdown
  }
}

const fakeKeyEvent = (overrides = {}) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  shiftKey: false,
  ...overrides
})

const traces = [
  {
    name: 'toggle strong inside one paragraph',
    initial: 'alpha',
    expected: 'a**lph**a\n',
    runJs: async (muya) => {
      setJsSelection(muya, 0, 1, 4)
      muya.format('strong')
    },
    runRust: (rust) => {
      rust.setSelection(0, 1, 4)
      rust.request({ type: 'toggle_strong' })
    }
  },
  {
    name: 'convert a paragraph to heading level two',
    initial: 'alpha',
    expected: '## alpha\n',
    runJs: async (muya) => {
      setJsSelection(muya, 0, 2)
      muya.updateParagraph('heading 2')
    },
    runRust: (rust) => {
      rust.setSelection(0, 2)
      rust.request({ type: 'set_heading', level: 2 })
    }
  },
  {
    name: 'split a plain paragraph at the caret',
    initial: 'alpha',
    expected: 'al\n\npha\n',
    runJs: async (muya) => {
      setJsSelection(muya, 0, 2)
      muya.contentState.enterHandler(fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelection(0, 2)
      rust.request({ type: 'insert_paragraph' })
    }
  },
  {
    name: 'split an unordered list item at the caret',
    initial: '- alpha',
    expected: '- al\n- pha\n',
    runJs: async (muya) => {
      setJsSelection(muya, 0, 2)
      muya.contentState.enterHandler(fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelection(0, 2)
      rust.request({ type: 'insert_paragraph' })
    }
  }
]

describeBundled('Muya JavaScript and Rust differential traces', () => {
  let jsEditor = null

  beforeAll(async () => {
    const wasm = readFileSync(
      resolve('Elephant/frontend/src/muya/lib/rust/generated/muya_wasm_bg.wasm')
    )
    await initWasm({ module_or_path: wasm })
  })

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const trace of traces) {
    it(trace.name, async () => {
      jsEditor = await createJsEditor(trace.initial)
      const rustEditor = new RustTraceEditor(trace.initial)

      await trace.runJs(jsEditor)
      trace.runRust(rustEditor)
      await settle()

      const jsMarkdown = jsEditor.getMarkdown()
      const rustMarkdown = rustEditor.markdown()
      expect(jsMarkdown).toBe(rustMarkdown)
      expect(rustMarkdown).toBe(trace.expected)
    })
  }
})

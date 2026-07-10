import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import {
  readMarkdownSelection,
  restoreMarkdownSelection
} from '../../../Elephant/frontend/src/renderer/src/muya/markdownSelectionRuntime.js'
import {
  markdownToJsonState,
  renderJsonStateIntoDom
} from '../../../Elephant/frontend/src/renderer/src/muya/jsonStateRuntime.js'

const editorFor = (markdown) => {
  const dom = new JSDOM('<div id="root"></div>')
  const root = dom.window.document.getElementById('root')
  renderJsonStateIntoDom(root, markdownToJsonState(markdown), dom.window.document)
  return { dom, root }
}

const select = (dom, node, offset) => {
  const range = dom.window.document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

describe('Muya Markdown selection runtime', () => {
  it('adds invisible heading prefixes to Rust UTF-16 offsets', () => {
    const { dom, root } = editorFor('## Title')
    const text = root.querySelector('h2').firstChild
    const selection = select(dom, text, 3)
    expect(readMarkdownSelection(root, selection)).toEqual({ anchor: 6, focus: 6 })
  })

  it('accounts for blank lines between rendered blocks', () => {
    const { dom, root } = editorFor('## Title\n\nBody')
    const text = root.querySelectorAll('p')[0].firstChild
    const selection = select(dom, text, 2)
    expect(readMarkdownSelection(root, selection)).toEqual({ anchor: 12, focus: 12 })
  })

  it('maps table cell positions into serialized Markdown rows', () => {
    const { dom, root } = editorFor('| A | B |\n| - | - |\n| 1 | 2 |')
    const secondCell = root.querySelectorAll('tbody td')[1].firstChild
    const selection = select(dom, secondCell, 1)
    expect(readMarkdownSelection(root, selection)).toEqual({ anchor: 27, focus: 27 })
  })

  it('round-trips cross-block selections', () => {
    const { dom, root } = editorFor('## Title\n\nBody')
    const expected = { anchor: 6, focus: 12 }
    expect(restoreMarkdownSelection(root, expected, dom.window.document)).toBe(true)
    expect(readMarkdownSelection(root, dom.window.getSelection())).toEqual(expected)
  })

  it('preserves backward selection direction when supported by the browser', () => {
    const { dom, root } = editorFor('## Title\n\nBody')
    const expected = { anchor: 12, focus: 6 }
    expect(restoreMarkdownSelection(root, expected, dom.window.document)).toBe(true)
    const actual = readMarkdownSelection(root, dom.window.getSelection())
    if (typeof dom.window.getSelection().extend === 'function') {
      expect(actual).toEqual(expected)
    } else {
      expect(actual).toEqual({ anchor: 6, focus: 12 })
    }
  })
})

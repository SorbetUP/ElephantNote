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

const editorForState = (state) => {
  const dom = new JSDOM('<div id="root"></div>')
  const root = dom.window.document.getElementById('root')
  renderJsonStateIntoDom(root, state, dom.window.document)
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

  it('maps a root-level cursor between blocks after the Markdown separator', () => {
    const { dom, root } = editorFor('## Title\n\nBody')
    const selection = select(dom, root, 1)
    expect(readMarkdownSelection(root, selection)).toEqual({ anchor: 10, focus: 10 })
  })

  it('maps table cell positions into serialized Markdown rows', () => {
    const { dom, root } = editorFor('| A | B |\n| - | - |\n| 1 | 2 |')
    const secondCell = root.querySelectorAll('tbody td')[1].firstChild
    const selection = select(dom, secondCell, 1)
    expect(readMarkdownSelection(root, selection)).toEqual({ anchor: 27, focus: 27 })
  })

  it('counts hidden syntax but restores the caret into visible strong text', () => {
    const { dom, root } = editorForState({
      version: 1,
      type: 'muya-json-state',
      blocks: [{
        type: 'paragraph',
        text: '**bold**',
        children: [{ type: 'text', text: '**bold**' }],
        inlineNodes: [{
          type: 'strong',
          text: 'bold',
          marker: '**',
          children: [{ type: 'text', text: 'bold' }]
        }]
      }]
    })
    const visibleText = root.querySelector('strong').firstChild
    expect(readMarkdownSelection(root, select(dom, visibleText, 2))).toEqual({ anchor: 4, focus: 4 })

    expect(restoreMarkdownSelection(root, { anchor: 2, focus: 2 }, dom.window.document)).toBe(true)
    const selection = dom.window.getSelection()
    expect(selection.anchorNode).toBe(visibleText)
    expect(selection.anchorOffset).toBe(0)
  })

  it('ignores the visual language label when mapping code selections', () => {
    const { dom, root } = editorForState({
      version: 1,
      type: 'muya-json-state',
      blocks: [{
        type: 'code_fence',
        marker: '```',
        info: 'python',
        language: 'python',
        text: 'abc',
        children: [{ type: 'text', text: 'abc' }]
      }]
    })
    const codeText = root.querySelector('code').firstChild
    expect(readMarkdownSelection(root, select(dom, codeText, 1))).toEqual({ anchor: 11, focus: 11 })
    expect(restoreMarkdownSelection(root, { anchor: 11, focus: 11 }, dom.window.document)).toBe(true)
    expect(dom.window.getSelection().anchorNode).toBe(codeText)
    expect(dom.window.getSelection().anchorOffset).toBe(1)
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

import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { renderJsonStateIntoDom } from '../../../Elephant/frontend/src/renderer/src/muya/jsonStateRuntime.js'
import { domToMarkdown } from '../../../Elephant/frontend/src/renderer/src/muya/liveRenderingRuntime.js'

const renderState = {
  version: 1,
  type: 'muya-json-state',
  blocks: [
    {
      type: 'paragraph',
      text: '**bold** ![drawing](../../.assets/drawing.png)',
      children: [{ type: 'text', text: '**bold** ![drawing](../../.assets/drawing.png)' }],
      inlineNodes: [
        {
          type: 'strong',
          text: 'bold',
          marker: '**',
          children: [{ type: 'text', text: 'bold' }]
        },
        { type: 'text', text: ' ' },
        {
          type: 'image',
          text: '![drawing](../../.assets/drawing.png)',
          alt: 'drawing',
          href: '../../.assets/drawing.png'
        }
      ]
    },
    {
      type: 'heading',
      level: 1,
      text: 'Heading',
      children: [{ type: 'text', text: 'Heading' }],
      inlineNodes: [{ type: 'text', text: 'Heading' }]
    },
    {
      type: 'code_fence',
      marker: '```',
      info: 'python',
      language: 'python',
      text: 'for i in range(2):\n    print(i)',
      children: [{ type: 'text', text: 'for i in range(2):\n    print(i)' }]
    }
  ]
}

describe('Rust renderer uses the Muya DOM contract', () => {
  it('renders Muya structure, hidden syntax, local images, headings and code blocks', () => {
    const dom = new JSDOM('<div id="root"></div>')
    const root = dom.window.document.getElementById('root')
    dom.window.DIRNAME = '/vault/notes'
    dom.window.path = {
      resolve: (...parts) => parts.join('/').replaceAll('//', '/')
    }
    globalThis.window = dom.window

    renderJsonStateIntoDom(root, renderState, dom.window.document)

    expect(root.id).toBe('ag-editor-id')
    expect(root.dataset.muyaRenderer).toBe('rust-compatible')
    expect(root.classList.contains('editor-component')).toBe(true)
    expect(root.querySelectorAll('.ag-paragraph').length).toBeGreaterThanOrEqual(3)
    expect(root.querySelector('p .ag-strong-marked-text strong')?.textContent).toBe('bold')
    expect(root.querySelectorAll('p [data-muya-marker="true"].ag-hide')).toHaveLength(3)
    expect(root.querySelector('h1.ag-paragraph')?.textContent).toBe('Heading')
    expect(root.querySelector('pre.ag-fence-code code.ag-code-content')?.textContent).toContain('print(i)')

    const image = root.querySelector('img.ag-inline-image')
    expect(image).toBeTruthy()
    expect(image.alt).toBe('drawing')
    expect(image.getAttribute('src')).toContain('.assets/drawing.png')
  })

  it('round-trips the visible Muya DOM without losing Markdown syntax', () => {
    const dom = new JSDOM('<div id="root"></div>')
    const root = dom.window.document.getElementById('root')
    globalThis.window = dom.window

    renderJsonStateIntoDom(root, renderState, dom.window.document)

    expect(domToMarkdown(root)).toBe([
      '**bold** ![drawing](../../.assets/drawing.png)',
      '# Heading',
      '```python\nfor i in range(2):\n    print(i)\n```'
    ].join('\n\n'))
  })
})

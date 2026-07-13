import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MuyaRustDomRenderer } from '../../../../../Elephant/frontend/src/muya/lib/rust/domRenderer'
import { MuyaRustInputController } from '../../../../../Elephant/frontend/src/muya/lib/rust/inputController'

const snapshot = () => ({
  markdown: 'alpha',
  document: {
    root: 1,
    nodes: [
      { id: 1, parent: null, children: [2], kind: { layer: 'document' }, source: null },
      {
        id: 2,
        parent: 1,
        children: [3],
        kind: { layer: 'block', value: { type: 'paragraph' } },
        source: null
      },
      {
        id: 3,
        parent: 2,
        children: [],
        kind: { layer: 'inline', value: { type: 'text', value: 'alpha' } },
        source: null
      }
    ]
  },
  revision: 0,
  selection: {
    anchor: { node: 3, offset_utf16: 2 },
    focus: { node: 3, offset_utf16: 2 }
  },
  can_undo: false,
  can_redo: false,
  composition_active: false
})

const browserEvent = (type, values = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value })
  }
  return event
}

const transfer = (values, { files = [] } = {}) => ({
  types: files.length ? ['Files', ...Object.keys(values)] : Object.keys(values),
  files,
  dropEffect: 'none',
  getData: (type) => values[type] || ''
})

describe('Muya Rust text drop controller', () => {
  let container
  let renderer
  let bridge
  let controller

  beforeEach(() => {
    container = document.createElement('section')
    document.body.replaceChildren(container)
    renderer = new MuyaRustDomRenderer(container)
    renderer.applySnapshot(snapshot())
    renderer.restoreSelection(snapshot().selection)
    bridge = {
      setSelection: vi.fn(async () => {}),
      dispatch: vi.fn(async () => {})
    }
    controller = new MuyaRustInputController(container, bridge, renderer).attach()
  })

  it('accepts text dragover and routes the drop through one paste command', async () => {
    const dataTransfer = transfer({ 'text/plain': 'one\n\ntwo' })
    const dragover = browserEvent('dragover', { dataTransfer })
    container.dispatchEvent(dragover)

    expect(dragover.defaultPrevented).toBe(true)
    expect(dataTransfer.dropEffect).toBe('copy')

    const drop = browserEvent('drop', { dataTransfer, clientX: 0, clientY: 0 })
    container.dispatchEvent(drop)
    await controller.idle()

    expect(drop.defaultPrevented).toBe(true)
    expect(bridge.setSelection).toHaveBeenCalledWith(snapshot().selection)
    expect(bridge.dispatch).toHaveBeenCalledWith({
      type: 'paste_markdown',
      markdown: 'one\n\ntwo'
    })
  })

  it('prefers a native Markdown drop payload over HTML and plain text', async () => {
    const dataTransfer = transfer({
      'text/markdown': '**native**',
      'text/html': '<p>html</p>',
      'text/plain': 'plain'
    })
    container.dispatchEvent(browserEvent('drop', { dataTransfer }))
    await controller.idle()

    expect(bridge.dispatch).toHaveBeenCalledWith({
      type: 'paste_markdown',
      markdown: '**native**'
    })
  })

  it('does not intercept file or image drops owned by Elephant', async () => {
    const dataTransfer = transfer(
      { 'text/plain': 'ignored' },
      { files: [{ name: 'image.png', type: 'image/png' }] }
    )
    const dragover = browserEvent('dragover', { dataTransfer })
    const drop = browserEvent('drop', { dataTransfer })

    container.dispatchEvent(dragover)
    container.dispatchEvent(drop)
    await controller.idle()

    expect(dragover.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    expect(bridge.dispatch).not.toHaveBeenCalled()
  })
})

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
    anchor: { node: 3, offset_utf16: 0 },
    focus: { node: 3, offset_utf16: 0 }
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

const clipboardData = (text, html = '') => ({
  getData: (type) => {
    if (type === 'text/plain') return text
    if (type === 'text/html') return html
    return ''
  }
})

const fakeBridge = () => ({
  setSelection: vi.fn(async () => {}),
  dispatch: vi.fn(async () => {})
})

describe('MuyaRustInputController', () => {
  let container
  let renderer
  let bridge
  let controller

  beforeEach(() => {
    container = document.createElement('section')
    document.body.replaceChildren(container)
    renderer = new MuyaRustDomRenderer(container)
    renderer.applySnapshot(snapshot())
    renderer.restoreSelection({
      anchor: { node: 3, offset_utf16: 2 },
      focus: { node: 3, offset_utf16: 2 }
    })
    bridge = fakeBridge()
    controller = new MuyaRustInputController(container, bridge, renderer).attach()
  })

  it('intercepts beforeinput and synchronizes selection before dispatch', async () => {
    const event = browserEvent('beforeinput', { inputType: 'insertText', data: 'X' })
    container.dispatchEvent(event)
    await controller.idle()

    expect(event.defaultPrevented).toBe(true)
    expect(bridge.setSelection).toHaveBeenCalledWith({
      anchor: { node: 3, offset_utf16: 2 },
      focus: { node: 3, offset_utf16: 2 }
    })
    expect(bridge.dispatch).toHaveBeenCalledWith({ type: 'insert_text', text: 'X' })
    expect(bridge.setSelection.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.dispatch.mock.invocationCallOrder[0]
    )
  })

  it('routes plain clipboard Markdown through one paste command', async () => {
    const event = browserEvent('paste', {
      clipboardData: clipboardData('one\n\ntwo')
    })
    container.dispatchEvent(event)
    await controller.idle()

    expect(event.defaultPrevented).toBe(true)
    expect(bridge.setSelection).toHaveBeenCalledWith({
      anchor: { node: 3, offset_utf16: 2 },
      focus: { node: 3, offset_utf16: 2 }
    })
    expect(bridge.dispatch).toHaveBeenCalledWith({
      type: 'paste_markdown',
      markdown: 'one\n\ntwo'
    })
  })

  it('normalizes semantic clipboard HTML before paste', async () => {
    const event = browserEvent('paste', {
      clipboardData: clipboardData(
        'bold and soft',
        '<p><strong>bold</strong> and <em>soft</em></p>'
      )
    })
    container.dispatchEvent(event)
    await controller.idle()

    expect(bridge.dispatch).toHaveBeenCalledWith({
      type: 'paste_markdown',
      markdown: '**bold** and *soft*'
    })
  })

  it('replaces the active IME range when composition text changes', async () => {
    container.dispatchEvent(browserEvent('compositionstart'))
    container.dispatchEvent(
      browserEvent('beforeinput', { inputType: 'insertCompositionText', data: 'に' })
    )
    container.dispatchEvent(
      browserEvent('beforeinput', { inputType: 'insertCompositionText', data: '日本' })
    )
    container.dispatchEvent(browserEvent('compositionend', { data: '日本' }))
    await controller.idle()

    expect(bridge.dispatch.mock.calls.map(([command]) => command)).toEqual([
      { type: 'begin_composition' },
      { type: 'update_composition', text: 'に' },
      { type: 'update_composition', text: '日本' },
      { type: 'commit_composition' }
    ])
    expect(bridge.setSelection.mock.calls).toEqual([
      [
        {
          anchor: { node: 3, offset_utf16: 2 },
          focus: { node: 3, offset_utf16: 2 }
        }
      ],
      [
        {
          anchor: { node: 3, offset_utf16: 2 },
          focus: { node: 3, offset_utf16: 2 }
        }
      ],
      [
        {
          anchor: { node: 3, offset_utf16: 2 },
          focus: { node: 3, offset_utf16: 3 }
        }
      ]
    ])
  })

  it('cancels an active composition with Escape', async () => {
    container.dispatchEvent(browserEvent('compositionstart'))
    const event = browserEvent('keydown', { key: 'Escape' })
    container.dispatchEvent(event)
    await controller.idle()

    expect(event.defaultPrevented).toBe(true)
    expect(bridge.dispatch).toHaveBeenLastCalledWith({ type: 'cancel_composition' })
  })
})

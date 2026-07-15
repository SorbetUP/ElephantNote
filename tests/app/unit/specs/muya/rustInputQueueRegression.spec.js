import { describe, expect, it, vi } from 'vitest'

import { MuyaRustInputController } from '../../../../../Elephant/frontend/src/muya/lib/rust/inputController'

const beforeInput = (data) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    inputType: { configurable: true, value: 'insertText' },
    data: { configurable: true, value: data }
  })
  return event
}

const selectionAt = (offset) => ({
  anchor: { node: 3, offset_utf16: offset },
  focus: { node: 3, offset_utf16: offset }
})

describe('Rust editor queued input selection', () => {
  it('reads the caret after each previous asynchronous character dispatch', async () => {
    const container = document.createElement('section')
    const renderer = { logical: {} }
    let renderedOffset = 2
    const bridge = {
      setSelection: vi.fn(async () => {}),
      dispatch: vi.fn(async () => {
        renderedOffset += 1
      })
    }
    const controller = new MuyaRustInputController(container, bridge, renderer).attach()
    controller.readSelection = vi.fn(() => selectionAt(renderedOffset))

    container.dispatchEvent(beforeInput('A'))
    container.dispatchEvent(beforeInput('B'))
    container.dispatchEvent(beforeInput('C'))
    await controller.idle()

    expect(bridge.dispatch.mock.calls.map(([command]) => command)).toEqual([
      { type: 'insert_text', text: 'A' },
      { type: 'insert_text', text: 'B' },
      { type: 'insert_text', text: 'C' }
    ])
    expect(bridge.setSelection.mock.calls.map(([selection]) => selection.focus.offset_utf16)).toEqual([
      2,
      3,
      4
    ])
  })
})

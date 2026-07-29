import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installEditorAutomationInputDefaults,
  restoreSelectionAfterFocus
} from '../../../Elephant/frontend/src/renderer/src/platform/automationEditorInputDefaults.js'

const placeCaret = (element, offset) => {
  const range = document.createRange()
  range.setStart(element.firstChild, offset)
  range.collapse(true)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('editor automation input defaults', () => {
  it('restores a middle caret on live text nodes when focus recreates the editor DOM', () => {
    const surface = document.createElement('div')
    surface.setAttribute('contenteditable', 'true')
    surface.textContent = 'alphomega'
    document.body.append(surface)
    placeCaret(surface, 4)

    const detachedTextNode = surface.firstChild
    vi.spyOn(surface, 'focus').mockImplementation(() => {
      surface.replaceChildren(document.createTextNode('alphomega'))
    })

    const restored = restoreSelectionAfterFocus({
      document,
      window,
      getSelection: () => window.getSelection()
    }, surface)

    const selection = window.getSelection()
    expect(restored).toBe(true)
    expect(selection.anchorNode).toBe(surface.firstChild)
    expect(selection.anchorNode).not.toBe(detachedTextNode)
    expect(selection.anchorOffset).toBe(4)
    expect(selection.focusNode).toBe(surface.firstChild)
    expect(selection.focusOffset).toBe(4)
  })

  it('dispatches Enter only after restoring the visible middle caret', async() => {
    const surface = document.createElement('div')
    surface.dataset.testid = 'probe-editor'
    surface.setAttribute('contenteditable', 'true')
    surface.textContent = 'alphomega'
    document.body.append(surface)
    placeCaret(surface, 4)

    vi.spyOn(surface, 'focus').mockImplementation(() => {
      surface.replaceChildren(document.createTextNode('alphomega'))
    })

    const observedCarets = []
    surface.addEventListener('keydown', () => {
      const selection = window.getSelection()
      observedCarets.push({
        liveNode: selection.anchorNode === surface.firstChild,
        anchor: selection.anchorOffset,
        focus: selection.focusOffset
      })
    })
    surface.addEventListener('beforeinput', (event) => event.preventDefault())

    const api = {
      press: vi.fn(),
      readDom: vi.fn(() => ({ text: surface.textContent }))
    }
    const target = {
      document,
      window,
      getSelection: () => window.getSelection(),
      __ELEPHANT_AUTOMATION__: api
    }

    expect(installEditorAutomationInputDefaults(target)).toBe(true)
    await expect(api.press('[data-testid="probe-editor"]', 'Enter')).resolves.toEqual({ text: 'alphomega' })
    expect(observedCarets).toEqual([{ liveNode: true, anchor: 4, focus: 4 }])
  })
})

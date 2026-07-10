// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  CODE_LANGUAGE_EVENT,
  ExecutableCodeLanguagePlugin
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeLanguageMuyaPlugin'

const makeMuya = ({ validBlock = true } = {}) => {
  document.body.innerHTML = `
    <div class="muya-container">
      <span id="language-block-1" class="ag-language-input">python</span>
    </div>
  `
  const container = document.querySelector('.muya-container')
  const languageBlock = validBlock
    ? { key: 'language-block-1', functionType: 'languageInput', text: 'python' }
    : { key: 'language-block-1', functionType: 'paragraphContent', text: 'python' }
  const updateCodeLanguage = vi.fn()
  const dispatchChange = vi.fn()
  const muya = {
    container,
    eventCenter: {
      attachDOMEvent(target, eventName, handler) {
        target.addEventListener(eventName, handler)
      }
    },
    contentState: {
      getBlock: vi.fn(() => languageBlock),
      updateCodeLanguage
    },
    dispatchChange
  }
  new ExecutableCodeLanguagePlugin(muya)
  return { muya, container, languageBlock, updateCodeLanguage, dispatchChange }
}

describe('ExecutableCodeLanguagePlugin', () => {
  it('updates Muya ContentState once and dispatches one markdown change', () => {
    const { container, languageBlock, updateCodeLanguage, dispatchChange } = makeMuya()
    const native = container.querySelector('.ag-language-input')
    const detail = {
      blockKey: 'language-block-1',
      language: 'javascript',
      handled: false
    }

    native.dispatchEvent(new CustomEvent(CODE_LANGUAGE_EVENT, {
      bubbles: true,
      detail
    }))

    expect(updateCodeLanguage).toHaveBeenCalledTimes(1)
    expect(updateCodeLanguage).toHaveBeenCalledWith(languageBlock, 'javascript')
    expect(dispatchChange).toHaveBeenCalledTimes(1)
    expect(detail.handled).toBe(true)
  })

  it('ignores events that do not target a languageInput block', () => {
    const { container, updateCodeLanguage, dispatchChange } = makeMuya({ validBlock: false })
    const native = container.querySelector('.ag-language-input')
    const detail = {
      blockKey: 'language-block-1',
      language: 'javascript',
      handled: false
    }

    native.dispatchEvent(new CustomEvent(CODE_LANGUAGE_EVENT, {
      bubbles: true,
      detail
    }))

    expect(updateCodeLanguage).not.toHaveBeenCalled()
    expect(dispatchChange).not.toHaveBeenCalled()
    expect(detail.handled).toBe(false)
  })

  it('ignores empty language and missing block identifiers', () => {
    const { container, updateCodeLanguage, dispatchChange } = makeMuya()
    const native = container.querySelector('.ag-language-input')

    native.dispatchEvent(new CustomEvent(CODE_LANGUAGE_EVENT, {
      bubbles: true,
      detail: { blockKey: '', language: '', handled: false }
    }))

    expect(updateCodeLanguage).not.toHaveBeenCalled()
    expect(dispatchChange).not.toHaveBeenCalled()
  })
})

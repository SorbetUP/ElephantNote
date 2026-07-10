// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Muya from '../../../../../../Elephant/frontend/src/muya/lib'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV6'
import { registerExecutableCodeLanguageMuyaPlugin } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeLanguageMuyaPlugin'

const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const settle = async() => {
  await wait(0)
  await wait(100)
  await wait(0)
}

const INITIAL_MARKDOWN = '```python\nprint("hello")\n```'

describe('executable code integration with real Muya ContentState', () => {
  let muya

  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    window.__ELEPHANT_CODE_LANGUAGE_BRIDGE__?.dispose?.()
    document.body.innerHTML = '<div class="en-editor-host muya-container"></div>'
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async(command) => {
          if (command === 'tauri_programs_list') {
            return { executionEnabled: true, outputLineLimit: 200, environments: [] }
          }
          return {}
        })
      }
    }
  })

  afterEach(() => {
    window.__ELEPHANT_CODE_LANGUAGE_BRIDGE__?.dispose?.()
    resetExecutableCodeBlocksForTests(window)
    muya?.destroy?.()
    muya = null
    delete window.__TAURI__
    document.body.innerHTML = ''
  })

  const createMuya = async() => {
    registerExecutableCodeLanguageMuyaPlugin()
    const origin = document.querySelector('.en-editor-host')
    muya = new Muya(origin, {
      markdown: INITIAL_MARKDOWN,
      t: (key) => key
    })
    await settle()
    return muya
  }

  it('does not modify Markdown when the inline runtime is installed', async() => {
    await createMuya()
    const baseline = muya.getMarkdown()
    const change = vi.fn()
    muya.on('change', change)

    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('real-muya-test')
    await settle()

    expect(muya.getMarkdown()).toBe(baseline)
    expect(muya.getMarkdown()).toContain('```python')
    expect(muya.getMarkdown()).toContain('print("hello")')
    expect(change).not.toHaveBeenCalled()
  })

  it('changes the fence through Muya exactly once without synthetic input', async() => {
    await createMuya()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('real-muya-test')
    await settle()

    const change = vi.fn()
    muya.on('change', change)
    const nativeInput = vi.fn()
    muya.container.addEventListener('input', nativeInput)

    const select = document.querySelector('.en-code-v6-language')
    expect(select).not.toBeNull()
    select.value = 'javascript'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()

    expect(nativeInput).not.toHaveBeenCalled()
    expect(change).toHaveBeenCalledTimes(1)
    expect(muya.getMarkdown()).toContain('```javascript')
    expect(muya.getMarkdown()).toContain('print("hello")')
    expect(muya.getMarkdown()).not.toContain('```python')
  })

  it('survives repeated real Muya language changes without stack growth', async() => {
    await createMuya()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('real-muya-test')
    await settle()

    const change = vi.fn()
    muya.on('change', change)

    for (let index = 0; index < 20; index += 1) {
      const select = document.querySelector('.en-code-v6-language')
      select.value = index % 2 === 0 ? 'javascript' : 'python'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await settle()
    }

    expect(change).toHaveBeenCalledTimes(20)
    expect(muya.getMarkdown()).toContain('```python')
    expect(muya.getMarkdown()).toContain('print("hello")')
  })
})

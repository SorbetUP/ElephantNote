// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Muya from '../../../../../../Elephant/frontend/src/muya/lib'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import {
  resetExecutableCodeNativeRuntimeForTests
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeNativeRuntime'

const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const settle = async() => {
  await wait(0)
  await wait(80)
  await wait(0)
}

const INITIAL_MARKDOWN = '```python\nprint("hello")\n```'

describe('native executable code integration with real Muya', () => {
  let muya
  let invoke

  beforeEach(() => {
    resetExecutableCodeNativeRuntimeForTests(window)
    document.body.innerHTML = '<div class="en-editor-host muya-container"></div>'
    invoke = vi.fn(async(command, payload) => {
      if (command === 'tauri_programs_list') {
        return { executionEnabled: true, outputLineLimit: 200, environments: [] }
      }
      if (command === 'tauri_programs_run' && payload.stop) return { stopped: true }
      if (command === 'tauri_programs_run') {
        return {
          success: true,
          language: payload.id,
          environment: payload.id,
          stdout: 'hello\n',
          stderr: '',
          exitCode: 0,
          durationMs: 3,
          interrupted: false,
          timedOut: false,
          truncated: false,
          outputLineLimit: 200
        }
      }
      return {}
    })
    window.__TAURI__ = { core: { invoke } }
  })

  afterEach(() => {
    resetExecutableCodeNativeRuntimeForTests(window)
    muya?.destroy?.()
    muya = null
    delete window.__TAURI__
    document.body.innerHTML = ''
  })

  const createMuya = async() => {
    const origin = document.querySelector('.en-editor-host')
    muya = new Muya(origin, {
      markdown: INITIAL_MARKDOWN,
      t: (key) => key
    })
    await settle()
    return muya
  }

  const setNativeLanguage = async(language) => {
    const native = document.querySelector('.ag-language-input')
    const languageBlock = muya.contentState.getBlock(native.id)
    muya.contentState.updateCodeLanguage(languageBlock, language)
    muya.dispatchChange()
    await settle()
  }

  it('renders native controls without modifying one Markdown character', async() => {
    await createMuya()
    const baseline = muya.getMarkdown()
    const change = vi.fn()
    muya.on('change', change)

    const runtime = installExecutableCodeBlocks(window)
    await settle()

    expect(runtime.version).toBe('native-v1')
    expect(document.querySelector('pre.ag-fence-code > .en-code-native-run')).not.toBeNull()
    expect(document.querySelector('pre.ag-fence-code > elephant-code-output')).not.toBeNull()
    expect(document.querySelector('.en-code-v6-toolbar')).toBeNull()
    expect(muya.getMarkdown()).toBe(baseline)
    expect(muya.getMarkdown()).toContain('```python')
    expect(muya.getMarkdown()).toContain('print("hello")')
    expect(change).not.toHaveBeenCalled()
  })

  it('uses Muya native language state and runs the selected language', async() => {
    await createMuya()
    installExecutableCodeBlocks(window)
    await settle()

    const change = vi.fn()
    const input = vi.fn()
    muya.on('change', change)
    muya.container.addEventListener('input', input)

    await setNativeLanguage('javascript')
    document.querySelector('.en-code-native-run').click()
    await settle()

    expect(input).not.toHaveBeenCalled()
    expect(change).toHaveBeenCalledTimes(1)
    expect(muya.getMarkdown()).toContain('```javascript')
    expect(muya.getMarkdown()).toContain('print("hello")')
    expect(muya.getMarkdown()).not.toContain('```python')
    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'javascript',
      command: 'print("hello")',
      stop: false
    }))
    const output = document.querySelector('elephant-code-output')
    expect(output.hidden).toBe(false)
    expect(output.shadowRoot.textContent).toContain('hello')
  })

  it('survives repeated native Muya language changes without recursion', async() => {
    await createMuya()
    installExecutableCodeBlocks(window)
    await settle()

    const change = vi.fn()
    muya.on('change', change)

    for (let index = 0; index < 20; index += 1) {
      await setNativeLanguage(index % 2 === 0 ? 'javascript' : 'python')
    }

    expect(change).toHaveBeenCalledTimes(20)
    expect(muya.getMarkdown()).toContain('```python')
    expect(muya.getMarkdown()).toContain('print("hello")')
    expect(document.querySelectorAll('.en-code-native-run')).toHaveLength(1)
    expect(document.querySelectorAll('elephant-code-output')).toHaveLength(1)
  })
})

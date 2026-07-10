// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV3'

const flush = async() => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const rect = (top = 40) => ({
  x: 20,
  y: top,
  left: 20,
  top,
  right: 620,
  bottom: top + 100,
  width: 600,
  height: 100,
  toJSON: () => ({})
})

const blockMarkup = (source, index = 0) => `
  <section data-code-block="${index}">
    <div class="muya-language-label">python</div>
    <pre class="language-python"><code class="language-python">${source}</code></pre>
    <button class="muya-copy-button" aria-label="Copy content" title="Copy content">copy</button>
    <span class="muya-code-fence-hint">Code fence</span>
  </section>
`

const installEditor = (sources = ['print("hello")']) => {
  document.body.innerHTML = `<main class="en-editor-host" contenteditable="true">
    ${sources.map((source, index) => blockMarkup(source, index)).join('')}
  </main>`
  for (const [index, pre] of [...document.querySelectorAll('pre')].entries()) {
    pre.getBoundingClientRect = () => rect(40 + index * 150)
  }
  return [...document.querySelectorAll('pre')]
}

describe('executable code blocks public runtime with Muya chrome', () => {
  let invoke
  let clipboardWrite
  let consoleError

  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    document.body.innerHTML = ''
    clipboardWrite = vi.fn(async() => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite }
    })
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke = vi.fn(async(command, payload) => {
      if (command === 'tauri_programs_list') {
        return { executionEnabled: true, outputLineLimit: 200, environments: [] }
      }
      if (command === 'tauri_programs_set') return payload.environments
      if (command === 'tauri_programs_run' && payload.stop) return { stopped: true }
      if (command === 'tauri_programs_run') {
        return {
          success: true,
          language: payload.id,
          environment: 'Python',
          stdout: 'hello\n',
          stderr: '',
          stdoutLines: 1,
          stderrLines: 0,
          exitCode: 0,
          durationMs: 4,
          interrupted: false,
          timedOut: false,
          truncated: false,
          outputLineLimit: 200
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    window.__TAURI__ = { core: { invoke } }
  })

  afterEach(() => {
    resetExecutableCodeBlocksForTests(window)
    consoleError.mockRestore()
    delete window.__TAURI__
  })

  it('keeps Run first in DOM after adding Copy and survives repeated scans', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    const toolbar = runtime.layer.querySelector('.en-code-runtime-toolbar')
    expect([...toolbar.querySelectorAll('button')].map((button) => button.className)).toEqual([
      'en-code-runner-run',
      'en-code-runner-copy'
    ])
    expect(toolbar.querySelector('button .en-code-runner-run-icon')).not.toBeNull()
    expect(() => runtime.scan('second-pass')).not.toThrow()
    await flush()
    expect(consoleError).not.toHaveBeenCalledWith('[Code:UI] scan:error', expect.anything())
  })

  it('dispatches a real run after the copy control has been installed', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    expect(runtime.layer.querySelector('.en-code-runner-copy')).not.toBeNull()
    runtime.layer.querySelector('.en-code-runner-run').click()
    await flush()

    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'python',
      command: 'print("hello")',
      stop: false
    }))
    expect(runtime.layer.textContent).toContain('hello')
  })

  it('repairs a removed run icon before a later editor scan', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    const runButton = runtime.layer.querySelector('.en-code-runner-run')
    runButton.querySelector('.en-code-runner-run-icon').remove()
    await flush()

    expect(runButton.querySelector('.en-code-runner-run-icon')).not.toBeNull()
    expect(() => runtime.scan('after-icon-repair')).not.toThrow()
    await flush()
  })

  it('does not classify runtime controls as native Muya copy controls', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    expect(document.querySelector('.muya-copy-button').classList.contains('en-code-runtime-native-copy')).toBe(true)
    expect(runtime.layer.querySelector('.en-code-runner-copy').classList.contains('en-code-runtime-native-copy')).toBe(false)
    expect(runtime.layer.querySelector('.en-code-runner-run').classList.contains('en-code-runtime-native-copy')).toBe(false)
    expect(document.querySelector('.muya-code-fence-hint').classList.contains('en-code-runtime-fence-hint')).toBe(true)
  })

  it('copies the exact code text through the runtime copy action', async() => {
    installEditor(['for i in range(2):\n  print(i)'])
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    runtime.layer.querySelector('.en-code-runner-copy').click()
    await flush()

    expect(clipboardWrite).toHaveBeenCalledWith('for i in range(2):\n  print(i)')
  })

  it('keeps one stable toolbar per block across a Muya host replacement', async() => {
    const [firstPre] = installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    const oldHost = firstPre.closest('[data-code-block]')
    const replacement = oldHost.cloneNode(true)
    const replacementPre = replacement.querySelector('pre')
    replacementPre.getBoundingClientRect = firstPre.getBoundingClientRect
    oldHost.replaceWith(replacement)
    runtime.scan('muya-host-replacement')
    await flush()

    expect(runtime.states.size).toBe(1)
    expect(runtime.layer.querySelectorAll('.en-code-runtime-toolbar')).toHaveLength(1)
    expect(runtime.layer.querySelectorAll('.en-code-runner-run')).toHaveLength(1)
    expect(runtime.layer.querySelectorAll('.en-code-runner-copy')).toHaveLength(1)
    expect(() => runtime.scan('post-replacement')).not.toThrow()
  })

  it('maintains the toolbar invariant independently for multiple blocks', async() => {
    installEditor(['print("one")', 'print("two")', 'print("three")'])
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    expect(runtime.states.size).toBe(3)
    const toolbars = [...runtime.layer.querySelectorAll('.en-code-runtime-toolbar')]
    expect(toolbars).toHaveLength(3)
    for (const toolbar of toolbars) {
      expect(toolbar.querySelector('button')).toBe(toolbar.querySelector('.en-code-runner-run'))
      expect(toolbar.querySelectorAll('.en-code-runner-copy')).toHaveLength(1)
      expect(toolbar.querySelector('.en-code-runner-run-icon')).not.toBeNull()
    }
    expect(() => runtime.scan('multi-block-rescan')).not.toThrow()
  })

  it('can refresh chrome repeatedly without duplicating controls', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    for (let index = 0; index < 10; index += 1) runtime.refreshCodeBlockChrome()

    const toolbar = runtime.layer.querySelector('.en-code-runtime-toolbar')
    expect(toolbar.querySelectorAll('.en-code-runner-run')).toHaveLength(1)
    expect(toolbar.querySelectorAll('.en-code-runner-run-icon')).toHaveLength(1)
    expect(toolbar.querySelectorAll('.en-code-runner-copy')).toHaveLength(1)
  })
})

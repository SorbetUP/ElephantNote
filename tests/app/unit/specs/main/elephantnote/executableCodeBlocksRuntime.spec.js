// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV6'

const flush = async() => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const installEditor = (source = 'print("hello")') => {
  document.body.innerHTML = `
    <main class="en-editor-host" contenteditable="true">
      <div class="ag-code-block" data-code-block="0">
        <span class="ag-language-input" contenteditable="true">python</span>
        <pre class="language-python"><code class="language-python">${source}</code></pre>
        <button class="ag-copy-code" type="button" aria-label="Copy code"></button>
        <span class="ag-fence-label">Code fence</span>
      </div>
    </main>
  `
  return document.querySelector('pre')
}

describe('executable code blocks V6 runtime', () => {
  let invoke
  let writeText

  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    document.body.innerHTML = ''
    writeText = vi.fn(async() => {})
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    window.getComputedStyle = vi.fn(() => ({
      backgroundColor: 'rgb(42, 42, 45)',
      color: 'rgb(220, 220, 222)'
    }))
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
    delete window.__TAURI__
  })

  it('installs one inline shell without changing source text', async() => {
    const pre = installEditor()
    const before = pre.textContent
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()

    const host = document.querySelector('.ag-code-block')
    expect(runtime.version).toBe('v6')
    expect(runtime.layer).toBeNull()
    expect(pre.textContent).toBe(before)
    expect(host.classList.contains('en-code-v6-shell')).toBe(true)
    expect(host.querySelector(':scope > .en-code-v6-toolbar')).not.toBeNull()
    expect(host.querySelector(':scope > .en-code-v6-output')).not.toBeNull()
  })

  it('copies code and dispatches a real run request', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()

    document.querySelector('.en-code-v6-copy').click()
    document.querySelector('.en-code-v6-run').click()
    await flush()

    expect(writeText).toHaveBeenCalledWith('print("hello")')
    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'python',
      command: 'print("hello")',
      stop: false
    }))
    expect(document.querySelector('.en-code-v6-output').textContent).toContain('hello')
  })

  it('keeps state and output when Muya replaces the pre node', async() => {
    const firstPre = installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()
    document.querySelector('.en-code-v6-run').click()
    await flush()

    const originalState = [...runtime.states.values()][0]
    const replacement = firstPre.cloneNode(true)
    firstPre.replaceWith(replacement)
    runtime.scan('muya-rerender')
    await flush()

    expect(runtime.states.size).toBe(1)
    expect([...runtime.states.values()][0]).toBe(originalState)
    expect(originalState.pre).toBe(replacement)
    expect(document.querySelector('.en-code-v6-output').textContent).toContain('hello')
  })

  it('turns Run into Stop and sends a stop request', async() => {
    let resolveRun
    invoke.mockImplementation(async(command, payload) => {
      if (command === 'tauri_programs_run' && payload.stop) return { stopped: true }
      if (command === 'tauri_programs_run') return new Promise((resolve) => { resolveRun = resolve })
      if (command === 'tauri_programs_list') return { executionEnabled: true, outputLineLimit: 200, environments: [] }
      return {}
    })

    installEditor('while True:\n  pass')
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()
    const button = document.querySelector('.en-code-v6-run')
    button.click()
    await flush()

    expect(button.classList.contains('is-running')).toBe(true)
    expect(button.getAttribute('aria-label')).toBe('Stop code execution')
    button.click()
    await flush()
    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({ stop: true }))

    resolveRun({
      success: false,
      interrupted: true,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 5,
      outputLineLimit: 200
    })
    await flush()
  })

  it('cleans all inline UI and shell classes on dispose', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()
    runtime.dispose()

    expect(document.querySelector('.en-code-v6-toolbar')).toBeNull()
    expect(document.querySelector('.en-code-v6-output')).toBeNull()
    expect(document.querySelector('.en-code-v6-shell')).toBeNull()
    expect(window.__ELEPHANT_CODE_RUNTIME__).toBeUndefined()
  })
})

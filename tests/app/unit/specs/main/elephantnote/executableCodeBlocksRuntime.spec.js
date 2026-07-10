// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installExecutableCodeBlocks,
  resetExecutableCodeBlocksForTests
} from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV3'

const flush = async() => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const installEditor = (source = 'print("hello")') => {
  document.body.innerHTML = `
    <main class="en-editor-host" contenteditable="true">
      <pre class="language-python"><code class="language-python">${source}</code></pre>
    </main>
  `
  const pre = document.querySelector('pre')
  pre.getBoundingClientRect = () => ({
    x: 20,
    y: 40,
    left: 20,
    top: 40,
    right: 620,
    bottom: 140,
    width: 600,
    height: 100,
    toJSON: () => ({})
  })
  return pre
}

describe('executable code blocks portal runtime', () => {
  let invoke

  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    document.body.innerHTML = ''
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
    delete window.__TAURI__
  })

  it('mounts controls outside the editable Muya tree without changing Markdown content', async() => {
    const pre = installEditor()
    const before = pre.textContent
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()

    expect(pre.textContent).toBe(before)
    expect(document.querySelector('.en-editor-host .en-code-runner-toolbar')).toBeNull()
    expect(document.querySelector('.en-editor-host .en-code-output')).toBeNull()
    expect(runtime.layer.parentElement).toBe(document.body)
    expect(runtime.layer.querySelector('.en-code-runner-toolbar')).not.toBeNull()
  })

  it('dispatches a real Tauri run request when the visible run control is clicked', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()

    runtime.layer.querySelector('.en-code-runner-run').click()
    await flush()

    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'python',
      command: 'print("hello")',
      stop: false
    }))
    expect(runtime.layer.querySelector('.en-code-output')).not.toBeNull()
    expect(runtime.layer.textContent).toContain('hello')
  })

  it('keeps the same state and output when Muya replaces the pre node', async() => {
    const firstPre = installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()
    runtime.layer.querySelector('.en-code-runner-run').click()
    await flush()

    const originalState = [...runtime.states.values()][0]
    const replacement = firstPre.cloneNode(true)
    replacement.getBoundingClientRect = firstPre.getBoundingClientRect
    firstPre.replaceWith(replacement)
    runtime.scan('muya-rerender')
    await flush()

    expect(runtime.states.size).toBe(1)
    expect([...runtime.states.values()][0]).toBe(originalState)
    expect(originalState.pre).toBe(replacement)
    expect(runtime.layer.textContent).toContain('hello')
  })

  it('turns the run triangle into a stop control and sends a stop request', async() => {
    let resolveRun
    invoke.mockImplementation(async(command, payload) => {
      if (command === 'tauri_programs_run' && payload.stop) return { stopped: true }
      if (command === 'tauri_programs_run') {
        return new Promise((resolve) => { resolveRun = resolve })
      }
      if (command === 'tauri_programs_list') return { executionEnabled: true, outputLineLimit: 200, environments: [] }
      return {}
    })

    installEditor('while True:\n  pass')
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()
    const button = runtime.layer.querySelector('.en-code-runner-run')
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
})

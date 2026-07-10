// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV4'

const wait = (milliseconds = 90) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const flush = async() => {
  await wait(0)
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await wait(0)
}
const settle = async() => wait(220)

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

describe('consolidated executable code block runtime', () => {
  let invoke
  let clipboardWrite

  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    document.body.innerHTML = ''
    clipboardWrite = vi.fn(async() => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite }
    })
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

  const start = async(sources) => {
    installEditor(sources)
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await settle()
    return runtime
  }

  it('renders exactly two text-free integrated actions', async() => {
    const runtime = await start()
    const toolbar = runtime.layer.querySelector('.en-code-v4-toolbar')
    expect(toolbar.children).toHaveLength(2)
    expect(toolbar.querySelectorAll('button')).toHaveLength(2)
    expect(toolbar.querySelector('.en-code-v4-copy')).not.toBeNull()
    expect(toolbar.querySelector('.en-code-v4-run')).not.toBeNull()
    expect(toolbar.textContent).toBe('')
  })

  it('ignores one hundred mutations inside the runtime layer', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    for (let index = 0; index < 100; index += 1) {
      const node = document.createElement('span')
      runtime.layer.append(node)
      node.remove()
    }
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
    expect(runtime.metrics.ignoredMutations).toBeGreaterThan(0)
  })

  it('ignores syntax-highlight span churn in an existing code element', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    const code = document.querySelector('code')
    for (let index = 0; index < 80; index += 1) {
      const span = document.createElement('span')
      span.textContent = String(index)
      code.append(span)
      span.remove()
    }
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('coalesces twenty topology changes into at most one scan', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    const editor = document.querySelector('.en-editor-host')
    for (let index = 0; index < 20; index += 1) {
      const wrapper = document.createElement('section')
      wrapper.innerHTML = `<pre class="language-python"><code>print(${index})</code></pre>`
      editor.append(wrapper)
      wrapper.remove()
    }
    await settle()
    expect(runtime.metrics.scans - scansBefore).toBeLessThanOrEqual(1)
  })

  it('runs real IPC and output rendering does not trigger another scan', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    runtime.layer.querySelector('.en-code-v4-run').click()
    await flush()
    await settle()
    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'python',
      command: 'print("hello")',
      stop: false
    }))
    expect(runtime.layer.querySelector('.en-code-v4-output').textContent).toContain('hello')
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('copies exact source and tags only native Muya chrome', async() => {
    const runtime = await start(['for i in range(2):\n  print(i)'])
    runtime.layer.querySelector('.en-code-v4-copy').click()
    await flush()
    expect(clipboardWrite).toHaveBeenCalledWith('for i in range(2):\n  print(i)')
    expect(document.querySelector('.muya-language-label').classList.contains('en-code-v4-language')).toBe(true)
    expect(document.querySelector('.muya-copy-button').classList.contains('en-code-v4-native-copy')).toBe(true)
    expect(document.querySelector('.muya-code-fence-hint').classList.contains('en-code-v4-fence-hint')).toBe(true)
    expect(runtime.layer.querySelector('.en-code-v4-copy').classList.contains('en-code-v4-native-copy')).toBe(false)
  })

  it('rebinds one stable state after a complete Muya host replacement', async() => {
    const runtime = await start()
    const state = [...runtime.states.values()][0]
    const firstPre = document.querySelector('pre')
    const oldHost = firstPre.closest('[data-code-block]')
    const replacement = oldHost.cloneNode(true)
    replacement.querySelector('pre').getBoundingClientRect = firstPre.getBoundingClientRect
    oldHost.replaceWith(replacement)
    await settle()
    expect(runtime.states.size).toBe(1)
    expect([...runtime.states.values()][0]).toBe(state)
    expect(runtime.layer.querySelectorAll('.en-code-v4-toolbar')).toHaveLength(1)
  })

  it('maintains one toolbar per block', async() => {
    const runtime = await start(['print("one")', 'print("two")', 'print("three")'])
    expect(runtime.states.size).toBe(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-toolbar')).toHaveLength(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-run')).toHaveLength(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-copy')).toHaveLength(3)
  })

  it('disconnects observation and removes portal UI on dispose', async() => {
    const runtime = await start()
    runtime.dispose()
    document.querySelector('.en-editor-host').append(document.createElement('pre'))
    await wait(120)
    expect(document.querySelector('.en-code-v4-layer')).toBeNull()
    expect(window.__ELEPHANT_CODE_RUNTIME__).toBeUndefined()
  })
})

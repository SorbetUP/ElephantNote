// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV5'

const wait = (milliseconds = 90) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const flush = async() => {
  await wait(0)
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await wait(0)
}
const settle = async() => wait(180)

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
  <section data-code-block="${index}" class="ag-code-block">
    <span class="ag-language-input" contenteditable="true">python</span>
    <pre class="language-python"><code class="language-python">${source}</code></pre>
    <button class="ag-copy-code" aria-label="Copy content" title="Copy content">copy</button>
    <span class="ag-fence-label">Code fence</span>
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

describe('stable executable code block UI', () => {
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
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
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
          environment: payload.id === 'javascript' ? 'JavaScript' : 'Python',
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

  it('renders a stable language selector with copy and run actions', async() => {
    const runtime = await start()
    const toolbar = runtime.layer.querySelector('.en-code-v5-toolbar')
    expect(toolbar.hidden).toBe(false)
    expect(toolbar.querySelectorAll('select')).toHaveLength(1)
    expect(toolbar.querySelectorAll('button')).toHaveLength(2)
    expect(toolbar.querySelector('.en-code-v5-language').value).toBe('python')
    expect(toolbar.querySelector('.en-code-v5-copy')).not.toBeNull()
    expect(toolbar.querySelector('.en-code-v5-run')).not.toBeNull()
  })

  it('changes the real Muya language and the persisted fence classes', async() => {
    const runtime = await start()
    const select = runtime.layer.querySelector('.en-code-v5-language')
    select.value = 'javascript'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()

    const native = document.querySelector('.ag-language-input')
    const pre = document.querySelector('pre')
    const code = document.querySelector('code')
    expect(native.textContent).toBe('javascript')
    expect(native.dataset.value).toBe('javascript')
    expect(pre.classList.contains('language-javascript')).toBe(true)
    expect(code.classList.contains('language-javascript')).toBe(true)
    expect([...runtime.states.values()][0].language).toBe('javascript')
  })

  it('runs the newly selected language through real IPC', async() => {
    const runtime = await start()
    const select = runtime.layer.querySelector('.en-code-v5-language')
    select.value = 'javascript'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    runtime.layer.querySelector('.en-code-v5-run').click()
    await flush()

    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'javascript',
      command: 'print("hello")',
      stop: false
    }))
  })

  it('anchors toolbar and output in document coordinates instead of viewport coordinates', async() => {
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 15 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 })
    const runtime = await start()
    runtime.layer.querySelector('.en-code-v5-run').click()
    await flush()

    const toolbar = runtime.layer.querySelector('.en-code-v5-toolbar')
    const output = runtime.layer.querySelector('.en-code-v5-output')
    expect(runtime.layer.classList.contains('en-code-v5-layer')).toBe(true)
    expect(toolbar.style.top).toBe('249px')
    expect(output.style.top).toBe('347px')
    expect(output.style.left).toBe('35px')
  })

  it('does not schedule layout or scans when the page scrolls', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    const scheduledBefore = runtime.metrics.scheduledScans
    window.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('scroll'))
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
    expect(runtime.metrics.scheduledScans).toBe(scheduledBefore)
  })

  it('keeps output rendering from causing another scan', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    runtime.layer.querySelector('.en-code-v5-run').click()
    await flush()
    await settle()
    expect(runtime.layer.querySelector('.en-code-v5-output').textContent).toContain('hello')
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('uses the code block computed surface instead of a white output panel', async() => {
    const runtime = await start()
    runtime.layer.querySelector('.en-code-v5-run').click()
    await flush()
    const output = runtime.layer.querySelector('.en-code-v5-output')
    expect(output.style.getPropertyValue('--en-code-v5-surface')).toBe('rgb(42, 42, 45)')
    expect(output.style.getPropertyValue('--en-code-v5-text')).toBe('rgb(220, 220, 222)')
  })

  it('ignores runtime and syntax-highlighting mutations', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    for (let index = 0; index < 100; index += 1) {
      const runtimeNode = document.createElement('span')
      runtime.layer.append(runtimeNode)
      runtimeNode.remove()
      const syntaxNode = document.createElement('span')
      document.querySelector('code').append(syntaxNode)
      syntaxNode.remove()
    }
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
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
    expect(runtime.layer.querySelectorAll('.en-code-v5-toolbar')).toHaveLength(1)
  })

  it('copies exact source and hides only the native Muya chrome', async() => {
    const runtime = await start(['for i in range(2):\n  print(i)'])
    runtime.layer.querySelector('.en-code-v5-copy').click()
    await flush()
    expect(clipboardWrite).toHaveBeenCalledWith('for i in range(2):\n  print(i)')
    expect(document.querySelector('.ag-language-input').classList.contains('en-code-v5-native-language')).toBe(true)
    expect(document.querySelector('.ag-copy-code').classList.contains('en-code-v5-native-copy')).toBe(true)
    expect(document.querySelector('.ag-fence-label').classList.contains('en-code-v5-fence-hint')).toBe(true)
  })
})

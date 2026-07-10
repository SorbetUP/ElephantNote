// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV6'

const wait = (milliseconds = 90) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const flush = async() => {
  await wait(0)
  await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0))
  await wait(0)
}
const settle = async() => wait(180)

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
  return [...document.querySelectorAll('pre')]
}

describe('inline executable code shell', () => {
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

  it('mounts toolbar, code and output in one Muya host', async() => {
    const runtime = await start()
    const state = [...runtime.states.values()][0]
    const host = document.querySelector('[data-code-block]')
    const toolbar = host.querySelector(':scope > .en-code-v6-toolbar')
    const pre = host.querySelector(':scope > pre')
    const output = host.querySelector(':scope > .en-code-v6-output')

    expect(runtime.layer).toBeNull()
    expect(state.host).toBe(host)
    expect(toolbar.parentElement).toBe(host)
    expect(pre.parentElement).toBe(host)
    expect(output.parentElement).toBe(host)
    expect(toolbar.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pre.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.body.querySelector(':scope > .en-code-v6-toolbar')).toBeNull()
    expect(document.body.querySelector(':scope > .en-code-v6-output')).toBeNull()
  })

  it('keeps the source text unchanged and runtime UI outside the pre', async() => {
    const [pre] = installEditor(['for i in range(2):\n  print(i)'])
    const before = pre.textContent
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await settle()

    expect(pre.textContent).toBe(before)
    expect(pre.querySelector('.en-code-v6-toolbar')).toBeNull()
    expect(pre.querySelector('.en-code-v6-output')).toBeNull()
    expect(document.querySelector('.en-code-v6-toolbar').contentEditable).toBe('false')
    expect(document.querySelector('.en-code-v6-output').contentEditable).toBe('false')
  })

  it('shows a stable language selector and exactly two code actions', async() => {
    await start()
    const toolbar = document.querySelector('.en-code-v6-toolbar')
    expect(toolbar.hidden).toBe(false)
    expect(toolbar.querySelectorAll('select')).toHaveLength(1)
    expect(toolbar.querySelectorAll('button')).toHaveLength(2)
    expect(toolbar.querySelector('.en-code-v6-language').value).toBe('python')
    expect(toolbar.querySelector('.en-code-v6-copy')).not.toBeNull()
    expect(toolbar.querySelector('.en-code-v6-run')).not.toBeNull()
  })

  it('changes the native Muya language and persisted fence classes', async() => {
    const runtime = await start()
    const select = document.querySelector('.en-code-v6-language')
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

  it('runs the selected language and expands output inside the same shell', async() => {
    const runtime = await start()
    const host = document.querySelector('[data-code-block]')
    const select = host.querySelector('.en-code-v6-language')
    select.value = 'javascript'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    host.querySelector('.en-code-v6-run').click()
    await flush()

    const output = host.querySelector('.en-code-v6-output')
    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'javascript',
      command: 'print("hello")',
      stop: false
    }))
    expect(output.hidden).toBe(false)
    expect(output.parentElement).toBe(host)
    expect(output.textContent).toContain('hello')
    expect(host.classList.contains('en-code-v6-has-output')).toBe(true)
    expect(runtime.states.size).toBe(1)
  })

  it('never writes floating position styles and does nothing on page scroll', async() => {
    const runtime = await start()
    document.querySelector('.en-code-v6-run').click()
    await flush()
    const toolbar = document.querySelector('.en-code-v6-toolbar')
    const output = document.querySelector('.en-code-v6-output')
    const scansBefore = runtime.metrics.scans
    const scheduledBefore = runtime.metrics.scheduledScans

    expect(toolbar.style.left).toBe('')
    expect(toolbar.style.top).toBe('')
    expect(toolbar.style.position).toBe('')
    expect(output.style.left).toBe('')
    expect(output.style.top).toBe('')
    expect(output.style.width).toBe('')
    expect(output.style.position).toBe('')

    window.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('scroll'))
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
    expect(runtime.metrics.scheduledScans).toBe(scheduledBefore)
  })

  it('does not rescan when output is rendered, collapsed, cleared or scrolled', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    document.querySelector('.en-code-v6-run').click()
    await flush()
    await settle()
    const output = document.querySelector('.en-code-v6-output')
    output.querySelector('.en-code-v6-output-actions button:nth-child(2)').click()
    output.querySelector('.en-code-v6-output-actions button:nth-child(2)').click()
    output.querySelector('.en-code-v6-output-actions button:nth-child(3)').click()
    output.dispatchEvent(new Event('scroll'))
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('copies exact source and hides the native duplicate chrome', async() => {
    await start(['for i in range(2):\n  print(i)'])
    document.querySelector('.en-code-v6-copy').click()
    await flush()
    expect(clipboardWrite).toHaveBeenCalledWith('for i in range(2):\n  print(i)')
    expect(document.querySelector('.ag-language-input').classList.contains('en-code-v6-native-language')).toBe(true)
    expect(document.querySelector('.ag-copy-code').classList.contains('en-code-v6-native-copy')).toBe(true)
    expect(document.querySelector('.ag-fence-label').classList.contains('en-code-v6-fence-hint')).toBe(true)
  })

  it('ignores runtime and syntax-highlighting mutations', async() => {
    const runtime = await start()
    const scansBefore = runtime.metrics.scans
    const output = document.querySelector('.en-code-v6-output')
    const code = document.querySelector('code')
    for (let index = 0; index < 100; index += 1) {
      const runtimeNode = document.createElement('span')
      output.append(runtimeNode)
      runtimeNode.remove()
      const syntaxNode = document.createElement('span')
      code.append(syntaxNode)
      syntaxNode.remove()
    }
    await settle()
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('rebinds one stable state and inline output after a Muya host replacement', async() => {
    const runtime = await start()
    document.querySelector('.en-code-v6-run').click()
    await flush()
    const state = [...runtime.states.values()][0]
    const oldHost = document.querySelector('[data-code-block]')
    const replacement = document.createElement('section')
    replacement.dataset.codeBlock = '0'
    replacement.className = 'ag-code-block'
    replacement.innerHTML = `
      <span class="ag-language-input" contenteditable="true">python</span>
      <pre class="language-python"><code class="language-python">print("hello")</code></pre>
      <button class="ag-copy-code" aria-label="Copy content">copy</button>
      <span class="ag-fence-label">Code fence</span>
    `
    oldHost.replaceWith(replacement)
    await settle()

    expect(runtime.states.size).toBe(1)
    expect([...runtime.states.values()][0]).toBe(state)
    expect(replacement.querySelectorAll(':scope > .en-code-v6-toolbar')).toHaveLength(1)
    expect(replacement.querySelectorAll(':scope > .en-code-v6-output')).toHaveLength(1)
    expect(replacement.querySelector('.en-code-v6-output').textContent).toContain('hello')
  })

  it('keeps exactly one shell UI per code block', async() => {
    const runtime = await start(['print("one")', 'print("two")', 'print("three")'])
    expect(runtime.states.size).toBe(3)
    expect(document.querySelectorAll('.en-code-v6-shell')).toHaveLength(3)
    expect(document.querySelectorAll('.en-code-v6-toolbar')).toHaveLength(3)
    expect(document.querySelectorAll('.en-code-v6-output')).toHaveLength(3)
    for (const host of document.querySelectorAll('.en-code-v6-shell')) {
      expect(host.querySelectorAll(':scope > .en-code-v6-toolbar')).toHaveLength(1)
      expect(host.querySelectorAll(':scope > .en-code-v6-output')).toHaveLength(1)
    }
  })

  it('removes state and leaves no orphan UI after deleting a block', async() => {
    const runtime = await start()
    document.querySelector('[data-code-block]').remove()
    await wait(1000)
    expect(runtime.states.size).toBe(0)
    expect(document.querySelector('.en-code-v6-toolbar')).toBeNull()
    expect(document.querySelector('.en-code-v6-output')).toBeNull()
  })
})

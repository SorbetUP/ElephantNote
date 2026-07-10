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

  it('renders only two minimal controls with no floating capsule content', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await flush()

    const toolbar = runtime.layer.querySelector('.en-code-v4-toolbar')
    expect(toolbar).not.toBeNull()
    expect(toolbar.children).toHaveLength(2)
    expect(toolbar.querySelectorAll('button')).toHaveLength(2)
    expect(toolbar.querySelector('.en-code-v4-copy')).not.toBeNull()
    expect(toolbar.querySelector('.en-code-v4-run')).not.toBeNull()
    expect(toolbar.textContent).toBe('')
  })

  it('does not rescan when toolbar and output DOM mutate', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await wait(120)
    const scansBefore = runtime.metrics.scans

    for (let index = 0; index < 100; index += 1) {
      const node = document.createElement('span')
      runtime.layer.append(node)
      node.remove()
    }
    await wait(160)

    expect(runtime.metrics.scans).toBe(scansBefore)
    expect(runtime.metrics.ignoredMutations).toBeGreaterThan(0)
  })

  it('does not rescan for syntax-highlight span churn inside an existing code node', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await wait(120)
    const scansBefore = runtime.metrics.scans
    const code = document.querySelector('code')

    for (let index = 0; index < 80; index += 1) {
      const span = document.createElement('span')
      span.textContent = String(index)
      code.append(span)
      span.remove()
    }
    await wait(160)

    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('coalesces a burst of real code-block topology mutations into one scan', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await wait(120)
    const scansBefore = runtime.metrics.scans
    const editor = document.querySelector('.en-editor-host')

    for (let index = 0; index < 20; index += 1) {
      const wrapper = document.createElement('section')
      wrapper.innerHTML = `<pre class="language-python"><code>print(${index})</code></pre>`
      editor.append(wrapper)
      wrapper.remove()
    }
    await wait(180)

    expect(runtime.metrics.scans - scansBefore).toBe(1)
    expect(runtime.metrics.coalescedScans).toBeGreaterThan(0)
  })

  it('dispatches a real run and rendering the result does not start a scan loop', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await wait(120)
    const scansBefore = runtime.metrics.scans

    runtime.layer.querySelector('.en-code-v4-run').click()
    await flush()
    await wait(160)

    expect(invoke).toHaveBeenCalledWith('tauri_programs_run', expect.objectContaining({
      id: 'python',
      command: 'print("hello")',
      stop: false
    }))
    expect(runtime.layer.querySelector('.en-code-v4-output').textContent).toContain('hello')
    expect(runtime.metrics.scans).toBe(scansBefore)
  })

  it('copies exact source text through the integrated copy action', async() => {
    installEditor(['for i in range(2):\n  print(i)'])
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    runtime.layer.querySelector('.en-code-v4-copy').click()
    await flush()

    expect(clipboardWrite).toHaveBeenCalledWith('for i in range(2):\n  print(i)')
  })

  it('styles only the real native language, copy, and fence controls', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    expect(document.querySelector('.muya-language-label')).toHaveClass('en-code-v4-language')
    expect(document.querySelector('.muya-copy-button')).toHaveClass('en-code-v4-native-copy')
    expect(document.querySelector('.muya-code-fence-hint')).toHaveClass('en-code-v4-fence-hint')
    expect(runtime.layer.querySelector('.en-code-v4-copy')).not.toHaveClass('en-code-v4-native-copy')
  })

  it('rebinds one stable state when Muya replaces the complete block host', async() => {
    const [firstPre] = installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()
    const state = [...runtime.states.values()][0]
    const oldHost = firstPre.closest('[data-code-block]')
    const replacement = oldHost.cloneNode(true)
    replacement.querySelector('pre').getBoundingClientRect = firstPre.getBoundingClientRect

    oldHost.replaceWith(replacement)
    await wait(180)

    expect(runtime.states.size).toBe(1)
    expect([...runtime.states.values()][0]).toBe(state)
    expect(runtime.layer.querySelectorAll('.en-code-v4-toolbar')).toHaveLength(1)
  })

  it('maintains one toolbar per block without duplicate scans', async() => {
    installEditor(['print("one")', 'print("two")', 'print("three")'])
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await wait(140)

    expect(runtime.states.size).toBe(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-toolbar')).toHaveLength(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-run')).toHaveLength(3)
    expect(runtime.layer.querySelectorAll('.en-code-v4-copy')).toHaveLength(3)
    expect(runtime.metrics.scans).toBeLessThanOrEqual(2)
  })

  it('stops observing and removes all portal UI on dispose', async() => {
    installEditor()
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('initial')
    await flush()

    runtime.dispose()
    document.querySelector('.en-editor-host').append(document.createElement('pre'))
    await wait(120)

    expect(document.querySelector('.en-code-v4-layer')).toBeNull()
    expect(window.__ELEPHANT_CODE_RUNTIME__).toBeUndefined()
  })
})

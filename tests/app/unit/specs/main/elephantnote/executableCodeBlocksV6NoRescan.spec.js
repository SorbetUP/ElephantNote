// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installExecutableCodeBlocks } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocks'
import { resetExecutableCodeBlocksForTests } from '../../../../../../Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV6'

const wait = (milliseconds = 180) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const installEditor = () => {
  document.body.innerHTML = `
    <main class="en-editor-host" contenteditable="true">
      <section class="ag-code-block" data-code-block="0">
        <span class="ag-language-input">python</span>
        <pre class="language-python"><code class="language-python">print("hello")</code></pre>
        <button class="ag-copy-code" aria-label="Copy content">copy</button>
        <span class="ag-fence-label">Code fence</span>
      </section>
    </main>
  `
}

describe('V6 output mutations never schedule editor scans', () => {
  beforeEach(() => {
    resetExecutableCodeBlocksForTests(window)
    installEditor()
    window.getComputedStyle = vi.fn(() => ({
      backgroundColor: 'rgb(42, 42, 45)',
      color: 'rgb(220, 220, 222)'
    }))
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async(command, payload) => {
          if (command === 'tauri_programs_list') {
            return { executionEnabled: true, outputLineLimit: 200, environments: [] }
          }
          if (command === 'tauri_programs_run' && !payload.stop) {
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
              truncated: false
            }
          }
          return { stopped: true }
        })
      }
    }
  })

  afterEach(() => {
    resetExecutableCodeBlocksForTests(window)
    delete window.__TAURI__
  })

  const start = async() => {
    const runtime = installExecutableCodeBlocks(window)
    runtime.scan('test')
    await wait()
    return runtime
  }

  it('does not scan after rendering the completed output', async() => {
    const runtime = await start()
    const before = runtime.metrics.scans
    document.querySelector('.en-code-v6-run').click()
    await wait()
    expect(runtime.metrics.scans).toBe(before)
  })

  it('does not scan after collapsing output', async() => {
    const runtime = await start()
    document.querySelector('.en-code-v6-run').click()
    await wait()
    const before = runtime.metrics.scans
    document.querySelector('.en-code-v6-output-actions button:nth-child(2)').click()
    await wait()
    expect(runtime.metrics.scans).toBe(before)
  })

  it('does not scan after expanding output', async() => {
    const runtime = await start()
    document.querySelector('.en-code-v6-run').click()
    await wait()
    document.querySelector('.en-code-v6-output-actions button:nth-child(2)').click()
    await wait()
    const before = runtime.metrics.scans
    document.querySelector('.en-code-v6-output-actions button:nth-child(2)').click()
    await wait()
    expect(runtime.metrics.scans).toBe(before)
  })

  it('does not scan after clearing output', async() => {
    const runtime = await start()
    document.querySelector('.en-code-v6-run').click()
    await wait()
    const before = runtime.metrics.scans
    document.querySelector('.en-code-v6-output-actions button:nth-child(3)').click()
    await wait()
    expect(runtime.metrics.scans).toBe(before)
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const importFromRoot = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href)
const readRuntime = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.js')
const readObserver = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlockObserver.js')
const readBackend = () => read('Elephant/backend/tauri/src/code_execution.rs')
const readTauriLib = () => read('Elephant/backend/tauri/src/lib_min.rs')
const readMain = () => read('Elephant/frontend/src/renderer/src/main.js')

describe('executable fenced code blocks', () => {
  it('registers real Rust commands instead of a renderer-only result', () => {
    const backend = readBackend()
    const tauriLib = readTauriLib()

    expect(tauriLib).toContain('pub mod code_execution;')
    expect(tauriLib).toContain('code_execution::tauri_programs_list')
    expect(tauriLib).toContain('code_execution::tauri_programs_set')
    expect(tauriLib).toContain('code_execution::tauri_programs_run')
    expect(backend).toContain('use tokio::{io::AsyncWriteExt, process::Command, time::timeout};')
    expect(backend).toContain('.stdin(Stdio::piped())')
    expect(backend).toContain('child.wait_with_output()')
    expect(backend).not.toContain('fake success')
  })

  it('bounds execution by source size, timeout, vault working directory and output size', () => {
    const backend = readBackend()

    expect(backend).toContain('MAX_CODE_BYTES')
    expect(backend).toContain('MAX_OUTPUT_BYTES')
    expect(backend).toContain('DEFAULT_TIMEOUT_MS')
    expect(backend).toContain('timeout(Duration::from_millis(timeout_ms)')
    expect(backend).toContain('Refusing to execute code outside the active vault.')
    expect(backend).toContain('.kill_on_drop(true)')
  })

  it('detects explicit interpreters and never routes arbitrary commands through a shell', () => {
    const backend = readBackend()

    expect(backend).toContain('candidates: &["python3", "python"]')
    expect(backend).toContain('candidates: &["node"]')
    expect(backend).toContain('candidates: &["bash"]')
    expect(backend).toContain('candidates: &["pwsh", "powershell"]')
    expect(backend).toContain('Command::new(executable)')
    expect(backend).not.toContain('sh -c')
    expect(backend).not.toContain('cmd /C')
  })

  it('adds Run controls to Muya fenced blocks and renders stdout and stderr in the note', () => {
    const runtime = readRuntime()
    const main = readMain()

    expect(main).toContain("import { installExecutableCodeBlocks } from './platform/executableCodeBlocks'")
    expect(main).toContain('installExecutableCodeBlocks()')
    expect(runtime).toContain("querySelectorAll('.en-editor-host pre, .muya-container pre, .ag-editor pre')")
    expect(runtime).toContain("run.textContent = 'Run'")
    expect(runtime).toContain("appendStream('stdout'")
    expect(runtime).toContain("appendStream('stderr'")
    expect(runtime).toContain("action === 'programs.run'")
  })

  it('prevents the toolbar MutationObserver feedback loop that froze the editor', async() => {
    const helper = await importFromRoot(
      'Elephant/frontend/src/renderer/src/platform/executableCodeBlockObserver.js'
    )
    const toolbarChild = { nodeType: 1 }
    const sourceNode = { nodeType: 1 }
    const toolbar = {
      contains: (node) => node === toolbarChild
    }

    expect(helper.relevantLanguageMutations([
      { type: 'childList', target: toolbarChild },
      { type: 'characterData', target: { nodeType: 3, parentElement: toolbarChild } },
      { type: 'characterData', target: sourceNode }
    ], toolbar)).toEqual([{ type: 'characterData', target: sourceNode }])

    const languageElement = { textContent: 'python' }
    const runButton = { disabled: false }
    expect(helper.applyLanguageUiState({
      languageElement,
      runButton,
      label: 'python',
      disabled: false
    })).toBe(false)
    expect(helper.applyLanguageUiState({
      languageElement,
      runButton,
      label: 'javascript',
      disabled: true
    })).toBe(true)
    expect(languageElement.textContent).toBe('javascript')
    expect(runButton.disabled).toBe(true)
  })

  it('logs every frontend and backend execution stage without logging source text', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    for (const event of [
      'install:start',
      'block:enhanced',
      'language:changed',
      'run:click',
      'run:dispatch',
      'invoke:start',
      'invoke:complete',
      'invoke:error',
      'run:result',
      'run:error',
      'run:finished'
    ]) {
      expect(runtime).toContain(event)
    }
    for (const event of [
      'command:start',
      'validation:source',
      'validation:language:start',
      'config:read:start',
      'executable:resolve:start',
      'cwd:resolve:start',
      'process:spawn:start',
      'process:stdin:write:start',
      'process:wait:start',
      'process:output:captured',
      'command:complete',
      'command:error'
    ]) {
      expect(backend).toContain(event)
    }
    expect(runtime).toContain('commandBytes')
    expect(runtime).not.toContain('sourceText: code')
    expect(backend).not.toContain('source={command}')
  })

  it('uses a renderer watchdog so a missing IPC response cannot leave Run stuck forever', () => {
    const runtime = readRuntime()

    expect(runtime).toContain('const RUN_WATCHDOG_MS = 20_000')
    expect(runtime).toContain('invoke:watchdog-timeout')
    expect(runtime).toContain('Promise.race([promise, watchdog])')
    expect(runtime).toContain("button.textContent = button.dataset.previousLabel || 'Run'")
    expect(runtime).toContain('runningBlocks.delete(pre)')
  })

  it('detects the real Muya language input around a fenced block', () => {
    const runtime = readRuntime()

    expect(runtime).toContain('[data-placeholder*="language" i]')
    expect(runtime).toContain('[placeholder*="language" i]')
    expect(runtime).toContain('pre.parentElement')
    expect(runtime).toContain('pre.previousElementSibling')
    expect(runtime).toContain('languageInput: describeElement(findLanguageInput(pre))')
  })

  it('exposes detected environments in Settings and requires an explicit global opt-in', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    expect(runtime).toContain("title.textContent = 'Code execution'")
    expect(runtime).toContain('Detecting local environments…')
    expect(runtime).toContain('Only run code you trust.')
    expect(runtime).toContain('executionEnabled: state.executionEnabled === true')
    expect(backend).toContain('execution_enabled: false')
    expect(backend).toContain('Code execution is disabled. Enable it in Settings')
  })

  it('contains a real interpreter execution test in the Rust module', () => {
    const backend = readBackend()

    expect(backend).toContain('executes_a_real_python_interpreter_when_available')
    expect(backend).toContain('"print(6 * 7)"')
    expect(backend).toContain('assert_eq!(result.stdout.trim(), "42")')
  })

  it('keeps the observer helper wired into the actual runtime', () => {
    const runtime = readRuntime()
    const observer = readObserver()

    expect(runtime).toContain("from './executableCodeBlockObserver'")
    expect(runtime).toContain('relevantLanguageMutations(records, toolbar)')
    expect(runtime).toContain('applyLanguageUiState({')
    expect(observer).toContain('languageElement.textContent !== label')
    expect(observer).toContain('runButton.disabled !== disabled')
  })
})

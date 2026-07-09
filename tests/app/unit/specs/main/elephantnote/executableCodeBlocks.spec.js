import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const importFromRoot = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href)
const readRuntime = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.js')
const readObserver = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlockObserver.js')
const readEditing = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeEditing.js')
const readStyles = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.css')
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
    expect(backend).toContain('io::{AsyncRead, AsyncReadExt, AsyncWriteExt}')
    expect(backend).toContain('.stdin(Stdio::piped())')
    expect(backend).toContain('child.wait()')
    expect(backend).not.toContain('fake success')
  })

  it('bounds execution by source size, timeout, vault working directory and a streaming tail buffer', () => {
    const backend = readBackend()

    expect(backend).toContain('MAX_CODE_BYTES')
    expect(backend).toContain('MAX_OUTPUT_BYTES')
    expect(backend).toContain('DEFAULT_TIMEOUT_MS')
    expect(backend).toContain('Duration::from_millis(timeout_ms)')
    expect(backend).toContain('Refusing to execute code outside the active vault.')
    expect(backend).toContain('.kill_on_drop(true)')
    expect(backend).toContain('VecDeque::with_capacity')
    expect(backend).toContain('capture_stream')
    expect(backend).toContain('process:stream:complete')
    expect(backend).not.toContain('wait_with_output')
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

  it('places the runner toolbar outside Muya editable content and renders a notebook-style output', () => {
    const runtime = readRuntime()
    const main = readMain()

    expect(main).toContain("import { installExecutableCodeBlocks } from './platform/executableCodeBlocks'")
    expect(main).toContain('installExecutableCodeBlocks()')
    expect(runtime).toContain("querySelectorAll('.en-editor-host pre, .muya-container pre, .ag-editor pre')")
    expect(runtime).toContain("pre.insertAdjacentElement('afterend', toolbar)")
    expect(runtime).toContain("toolbarPlacement: 'sibling-after-pre'")
    expect(runtime).toContain("appendStream('stdout'")
    expect(runtime).toContain("appendStream('stderr'")
    expect(runtime).toContain("copyButton.textContent = 'Copy'")
    expect(runtime).toContain("collapseButton.textContent = 'Collapse'")
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

  it('adds practical code editing behavior for indentation and execution shortcuts', async() => {
    const editing = await importFromRoot(
      'Elephant/frontend/src/renderer/src/platform/executableCodeEditing.js'
    )
    const runtime = readRuntime()

    expect(editing.indentationForNewline('if ready:', 9, 'python')).toBe('\n  ')
    expect(editing.indentationForNewline('  value = 1', 11, 'python')).toBe('\n  ')
    expect(editing.indentationEdit('alpha', 5, 5, false)).toMatchObject({ replacement: '  ' })
    expect(editing.indentationEdit('a\nb', 0, 3, false).replacement).toBe('  a\n  b')
    expect(editing.indentationEdit('  a\n  b', 0, 7, true).replacement).toBe('a\nb')
    expect(runtime).toContain("event.key === 'Tab'")
    expect(runtime).toContain("event.key === 'Enter'")
    expect(runtime).toContain('event.metaKey || event.ctrlKey')
    expect(runtime).toContain('editor:auto-indent')
    expect(runtime).toContain('editor:shortcut-run')
  })

  it('keeps only the configured output tail and exposes the limit in Settings', async() => {
    const editing = await importFromRoot(
      'Elephant/frontend/src/renderer/src/platform/executableCodeEditing.js'
    )
    const runtime = readRuntime()
    const backend = readBackend()

    expect(editing.normalizeOutputLineLimit(0)).toBe(10)
    expect(editing.normalizeOutputLineLimit(999999)).toBe(5000)
    expect(editing.normalizeOutputLineLimit('200')).toBe(200)
    expect(runtime).toContain("'Retained output'")
    expect(runtime).toContain('outputLineLimit')
    expect(runtime).toContain('Earlier output was omitted')
    expect(runtime).toContain('stream.scrollTop = stream.scrollHeight')
    expect(backend).toContain('DEFAULT_OUTPUT_LINE_LIMIT: usize = 200')
    expect(backend).toContain('prepare_stream')
    expect(backend).toContain('stdoutDroppedLines')
    expect(backend).toContain('stderrDroppedBytes')
    expect(backend).toContain('capture_stream_is_memory_bounded_and_keeps_the_tail')
  })

  it('uses the real Settings primitives and Vue scope instead of a custom oversized panel', () => {
    const runtime = readRuntime()
    const styles = readStyles()

    expect(runtime).toContain("row.className = 'en-settings-row en-code-environment-row'")
    expect(runtime).toContain("copy.className = 'en-settings-row-copy'")
    expect(runtime).toContain("outputSelect.className = 'en-compact-select'")
    expect(runtime).toContain("executable.className = 'en-compact-input en-code-executable-input'")
    expect(runtime).toContain('status.className = `en-status-badge')
    expect(runtime).toContain('applyVueScope(host, scopeSource)')
    expect(runtime).toContain("name.startsWith('data-v-')")
    expect(styles).toContain('.en-code-environment-controls')
    expect(styles).toContain('.en-settings-panel .en-code-settings-group .en-switch')
    expect(styles).not.toContain('grid-template-columns: minmax(160px, 0.9fr) minmax(180px, 1.1fr) auto')
  })

  it('logs every frontend and backend execution stage without logging source text', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    for (const event of [
      'install:start',
      'block:enhanced',
      'editor:enhanced',
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
      'executable:resolve:complete',
      'cwd:resolve:start',
      'process:spawn:start',
      'process:stdin:write:start',
      'process:wait:start',
      'process:stream:start',
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
    expect(runtime).toContain("button.querySelector('.en-code-runner-run-label').textContent = 'Run'")
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

  it('requires explicit opt-in and contains real Rust process tests', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    expect(runtime).toContain("'Code execution'")
    expect(runtime).toContain('Detecting local environments…')
    expect(runtime).toContain('Only execute code you trust')
    expect(runtime).toContain('executionEnabled: state.executionEnabled === true')
    expect(backend).toContain('execution_enabled: false')
    expect(backend).toContain('Code execution is disabled. Enable it in Settings')
    expect(backend).toContain('executes_a_real_python_interpreter_when_available')
    expect(backend).toContain('"print(6 * 7)"')
    expect(backend).toContain('assert_eq!(result.stdout.text.trim(), "42")')
  })

  it('keeps the observer and editing helpers wired into the actual runtime', () => {
    const runtime = readRuntime()
    const observer = readObserver()
    const editing = readEditing()

    expect(runtime).toContain("from './executableCodeBlockObserver'")
    expect(runtime).toContain("from './executableCodeEditing'")
    expect(runtime).toContain('relevantLanguageMutations(records, toolbar)')
    expect(runtime).toContain('applyLanguageUiState({')
    expect(observer).toContain('languageElement.textContent !== label')
    expect(observer).toContain('runButton.disabled !== disabled')
    expect(editing).toContain('indentationForNewline')
    expect(editing).toContain('indentationEdit')
  })
})

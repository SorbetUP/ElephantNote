import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const importFromRoot = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href)
const readRuntime = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocksV2.js')
const readObserver = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlockObserver.js')
const readEditing = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeEditing.js')
const readStyles = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.v2.css')
const readBackend = () => read('Elephant/backend/tauri/src/code_execution_v2.rs')
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
    expect(backend).toContain('process::{Child, Command}')
    expect(backend).toContain('.stdin(Stdio::piped())')
    expect(backend).toContain('child.wait()')
    expect(backend).not.toContain('fake success')
  })

  it('bounds execution by source size, timeout, vault directory and streaming tail buffers', () => {
    const backend = readBackend()

    expect(backend).toContain('MAX_CODE_BYTES')
    expect(backend).toContain('MAX_OUTPUT_BYTES')
    expect(backend).toContain('DEFAULT_TIMEOUT_MS')
    expect(backend).toContain('VecDeque::with_capacity(MAX_OUTPUT_BYTES)')
    expect(backend).toContain('capture_stream')
    expect(backend).toContain('Refusing to execute code outside the active vault.')
    expect(backend).toContain('.kill_on_drop(true)')
    expect(backend).not.toContain('wait_with_output')
  })

  it('supports a real interrupt path rather than hiding the output panel', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    expect(runtime).toContain("action === 'stop'")
    expect(runtime).toContain('void stopBlock(target, current)')
    expect(runtime).toContain("button.setAttribute('aria-label', isRunning ? 'Stop code execution' : 'Run code block')")
    expect(runtime).toContain("icon.textContent = isRunning ? '' : '▶'")
    expect(backend).toContain('RUNNING_EXECUTIONS')
    expect(backend).toContain('oneshot::Sender<()>')
    expect(backend).toContain('request_stop')
    expect(backend).toContain('send_interrupt_signal')
    expect(backend).toContain('signal=SIGINT')
    expect(backend).toContain('Execution interrupted by user.')
    expect(backend).toContain('interrupts_a_real_python_process_when_available')
  })

  it('detects explicit interpreters and never routes arbitrary source through a shell', () => {
    const backend = readBackend()

    expect(backend).toContain('candidates: &["python3", "python"]')
    expect(backend).toContain('candidates: &["node"]')
    expect(backend).toContain('candidates: &["bash"]')
    expect(backend).toContain('candidates: &["pwsh", "powershell"]')
    expect(backend).toContain('Command::new(executable)')
    expect(backend).not.toContain('sh -c')
    expect(backend).not.toContain('cmd /C')
  })

  it('uses compact in-block controls instead of a white toolbar below the code fence', () => {
    const runtime = readRuntime()
    const styles = readStyles()

    expect(runtime).toContain("host.setAttribute?.(HOST_ATTRIBUTE, 'true')")
    expect(runtime).toContain('host.append(toolbar)')
    expect(runtime).toContain("toolbarPlacement: state.host === pre ? 'sibling-fallback' : 'stable-code-host'")
    expect(styles).toContain("[data-elephant-code-host='true']")
    expect(styles).toContain('position: absolute;')
    expect(styles).toContain('right: 47px;')
    expect(styles).toContain('var(--editorColor, currentColor)')
    expect(styles).not.toContain('var(--en-card, #fff)')
    expect(styles).not.toContain('min-width: 72px')
  })

  it('keeps output state across Muya node replacement and only clears explicitly', () => {
    const runtime = readRuntime()

    expect(runtime).toContain('const blockStates = new Map()')
    expect(runtime).toContain('DETACHED_STATE_GRACE_MS')
    expect(runtime).toContain('state.fingerprint === fingerprint || state.ordinal === ordinal')
    expect(runtime).toContain('renderOutput(state)')
    expect(runtime).toContain("clearButton.textContent = 'Clear'")
    expect(runtime).toContain('state.result = null')
    expect(runtime).toContain('block:state-pruned')
  })

  it('renders a readable notebook-style output with bounded scrolling', () => {
    const runtime = readRuntime()
    const styles = readStyles()

    expect(runtime).toContain("appendStream('stdout'")
    expect(runtime).toContain("appendStream('stderr'")
    expect(runtime).toContain("copyButton.textContent = 'Copy'")
    expect(runtime).toContain("collapseButton.textContent = 'Collapse'")
    expect(runtime).toContain('stream.scrollTop = stream.scrollHeight')
    expect(styles).toContain('max-height: min(42vh, 340px)')
    expect(styles).toContain('overflow: auto')
    expect(styles).toContain('--en-code-surface')
  })

  it('prevents the toolbar MutationObserver feedback loop that froze the editor', async() => {
    const helper = await importFromRoot(
      'Elephant/frontend/src/renderer/src/platform/executableCodeBlockObserver.js'
    )
    const toolbarChild = { nodeType: 1 }
    const sourceNode = { nodeType: 1 }
    const toolbar = { contains: (node) => node === toolbarChild }

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
    expect(runtime).toContain('Earlier output was discarded')
    expect(backend).toContain('DEFAULT_OUTPUT_LINE_LIMIT: usize = 200')
    expect(backend).toContain('prepare_stream')
    expect(backend).toContain('stdoutDroppedLines')
    expect(backend).toContain('capture_stream_is_memory_bounded_and_keeps_the_tail')
  })

  it('uses the real Settings primitives and Vue scope', () => {
    const runtime = readRuntime()
    const styles = readStyles()

    expect(runtime).toContain("row.className = 'en-settings-row en-code-environment-row'")
    expect(runtime).toContain("copy.className = 'en-settings-row-copy'")
    expect(runtime).toContain("outputSelect.className = 'en-compact-select'")
    expect(runtime).toContain("executable.className = 'en-compact-input en-code-executable-input'")
    expect(runtime).toContain('applyVueScope(host, scopeSource)')
    expect(styles).toContain('.en-code-environment-controls')
    expect(styles).toContain('.en-settings-panel .en-code-settings-group .en-switch')
  })

  it('logs frontend and backend execution stages without logging source text', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    for (const event of [
      'install:start',
      'block:enhanced',
      'run:dispatch',
      'invoke:start',
      'invoke:complete',
      'invoke:error',
      'run:result',
      'run:error',
      'run:finished',
      'stop:dispatch',
      'stop:result'
    ]) expect(runtime).toContain(event)

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
      'process:interrupt:requested',
      'process:output:captured',
      'command:complete',
      'command:error'
    ]) expect(backend).toContain(event)

    expect(runtime).toContain('commandBytes')
    expect(runtime).not.toContain('sourceText: code')
    expect(backend).not.toContain('source={command}')
  })

  it('uses a renderer watchdog so missing IPC cannot leave the control stuck', () => {
    const runtime = readRuntime()

    expect(runtime).toContain('const RUN_WATCHDOG_MS = 22_000')
    expect(runtime).toContain('invoke:watchdog-timeout')
    expect(runtime).toContain('Promise.race([promise, watchdog])')
    expect(runtime).toContain('state.executionId = null')
    expect(runtime).toContain('renderToolbar(state)')
  })

  it('keeps the observer and editing helpers wired into the actual runtime', () => {
    const runtime = readRuntime()
    const observer = readObserver()
    const editing = readEditing()
    const main = readMain()

    expect(main).toContain("import { installExecutableCodeBlocks } from './platform/executableCodeBlocks'")
    expect(main).toContain('installExecutableCodeBlocks()')
    expect(runtime).toContain("from './executableCodeBlockObserver'")
    expect(runtime).toContain("from './executableCodeEditing'")
    expect(runtime).toContain('relevantLanguageMutations(records, toolbar)')
    expect(runtime).toContain('applyLanguageUiState({')
    expect(observer).toContain('languageElement.textContent !== label')
    expect(editing).toContain('indentationForNewline')
    expect(editing).toContain('indentationEdit')
  })
})

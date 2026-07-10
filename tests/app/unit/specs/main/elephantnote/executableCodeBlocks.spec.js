import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readRuntime = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeNativeRuntime.js')
const readLifecycle = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeNativeLifecycle.js')
const readSettings = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeSettings.js')
const readRenderer = () => read('Elephant/frontend/src/muya/lib/parser/render/renderBlock/renderContainerBlock.js')
const readRendererHelper = () => read('Elephant/frontend/src/muya/lib/parser/render/renderBlock/renderExecutableCodeRuntime.js')
const readStyles = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeNativeRuntime.css')
const readBackend = () => read('Elephant/backend/tauri/src/code_execution_v2.rs')
const readTauriLib = () => read('Elephant/backend/tauri/src/lib_min.rs')
const readMain = () => read('Elephant/frontend/src/renderer/src/main.js')

describe('native executable fenced code blocks', () => {
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

  it('bounds source, execution time and retained stream output', () => {
    const backend = readBackend()

    expect(backend).toContain('MAX_CODE_BYTES')
    expect(backend).toContain('MAX_OUTPUT_BYTES')
    expect(backend).toContain('DEFAULT_TIMEOUT_MS')
    expect(backend).toContain('VecDeque::with_capacity(MAX_OUTPUT_BYTES)')
    expect(backend).toContain('capture_stream')
    expect(backend).toContain('.kill_on_drop(true)')
    expect(backend).not.toContain('wait_with_output')
  })

  it('uses explicit interpreters and never routes arbitrary source through a shell', () => {
    const backend = readBackend()

    expect(backend).toContain('candidates: &["python3", "python"]')
    expect(backend).toContain('candidates: &["node"]')
    expect(backend).toContain('candidates: &["bash"]')
    expect(backend).toContain('candidates: &["pwsh", "powershell"]')
    expect(backend).toContain('Command::new(executable)')
    expect(backend).not.toContain('sh -c')
    expect(backend).not.toContain('cmd /C')
  })

  it('renders Run and Output as native children of Muya fenced code', () => {
    const renderer = readRenderer()
    const helper = readRendererHelper()

    expect(renderer).toContain("functionType === 'fencecode'")
    expect(renderer).toContain('renderExecutableRunButton(block)')
    expect(renderer).toContain('renderExecutableOutput(block)')
    expect(helper).toContain('button.en-code-native-run')
    expect(helper).toContain('elephant-code-output.en-code-native-output')
    expect(helper).toContain("contenteditable: 'false'")
  })

  it('has no editor scanner, portal or floating coordinate layout', () => {
    const runtime = readRuntime()
    const styles = readStyles()

    expect(runtime).not.toContain('MutationObserver')
    expect(runtime).not.toContain('scheduleScan')
    expect(runtime).not.toContain('scan:topology')
    expect(runtime).not.toContain('document.body.append(layer)')
    expect(runtime).not.toContain('getBoundingClientRect')
    expect(styles).not.toContain('position: fixed')
    expect(styles).not.toContain('position: absolute;\n  top:')
  })

  it('keeps Copy permanently visible and uses one continuous header background', () => {
    const styles = readStyles()

    expect(styles).toContain('--en-code-header-bg:')
    expect(styles).toContain('background: var(--en-code-header-bg) !important;')
    expect(styles).toContain('pre.en-code-native-shell > .ag-language-input')
    expect(styles).toContain('background: transparent !important;')
    expect(styles).toContain('visibility: visible !important;')
    expect(styles).toContain('opacity: 1 !important;')
    expect(styles).toContain('pointer-events: auto !important;')
    expect(styles).toContain('pre.en-code-native-shell > .ag-code-copy > .icon::before')
    expect(styles).toContain('pre.en-code-native-shell > .ag-code-copy > .icon::after')
  })

  it('suppresses Muya code-fence decoration and preserves real code indentation', () => {
    const styles = readStyles()

    expect(styles).toContain('pre.en-code-native-shell.ag-active.ag-fence-code > code::before')
    expect(styles).toContain('content: none !important;')
    expect(styles).toContain('pre.en-code-native-shell > code *')
    expect(styles).toContain('white-space: pre !important;')
    expect(styles).toContain('overflow-wrap: normal !important;')
    expect(styles).toContain('word-break: normal !important;')
    expect(styles).toContain('overflow-x: auto !important;')
    expect(styles).toContain('tab-size: 4;')
  })

  it('keeps output state through custom-element reconnect and prunes deletion separately', () => {
    const runtime = readRuntime()
    const lifecycle = readLifecycle()

    expect(runtime).toContain('connectedCallback()')
    expect(runtime).toContain('disconnectedCallback()')
    expect(runtime).toContain('registerOutput(this)')
    expect(runtime).toContain('unregisterOutput(this)')
    expect(lifecycle).toContain('__elephantCodeStateKey')
    expect(lifecycle).toContain('DETACHED_TTL_MS')
    expect(lifecycle).toContain('runtime.states.delete(key)')
  })

  it('provides real Run, Stop, bounded output and keyboard execution', () => {
    const runtime = readRuntime()
    const backend = readBackend()

    expect(runtime).toContain("action === 'stop'")
    expect(runtime).toContain("event.key !== 'Enter'")
    expect(runtime).toContain('event.metaKey || event.ctrlKey')
    expect(runtime).toContain('state.executionId')
    expect(runtime).toContain('max-height: 300px')
    expect(backend).toContain('RUNNING_EXECUTIONS')
    expect(backend).toContain('request_stop')
    expect(backend).toContain('send_interrupt_signal')
    expect(backend).toContain('signal=SIGINT')
  })

  it('keeps Settings isolated from the Muya editor runtime', () => {
    const settings = readSettings()

    expect(settings).toContain("const SETTINGS_HOST = '.en-settings-content'")
    expect(settings).toContain('target.elephantnote.programs.list()')
    expect(settings).toContain('target.elephantnote.programs.set')
    expect(settings).toContain('MutationObserver')
    expect(settings).not.toContain('ag-fence-code')
    expect(settings).not.toContain('querySelectorAll(\'pre\')')
  })

  it('keeps the public bootstrap wired only to active, separated modules', () => {
    const entry = read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.js')
    const main = readMain()

    expect(main).toContain("import { installExecutableCodeBlocks } from './platform/executableCodeBlocks'")
    expect(main).toContain('installExecutableCodeBlocks()')
    expect(entry).toContain("from './executableCodeNativeRuntime'")
    expect(entry).toContain("from './executableCodeNativeLifecycle'")
    expect(entry).toContain("from './executableCodeSettings'")
    expect(entry).not.toContain('executableCodeBlocksV6')
  })
})

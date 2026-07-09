import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readRuntime = () => read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.js')
const readBackend = () => read('Elephant/backend/tauri/src/code_execution.rs')
const readTauriLib = () => read('Elephant/backend/tauri/src/lib_min.rs')
const readMain = () => read('Elephant/frontend/src/renderer/src/main.js')

describe('executable fenced code blocks', () => {
  it('registers real Rust commands instead of a renderer-only fake result', () => {
    const backend = readBackend()
    const tauriLib = readTauriLib()

    expect(tauriLib).toContain('pub mod code_execution;')
    expect(tauriLib).toContain('code_execution::tauri_programs_list')
    expect(tauriLib).toContain('code_execution::tauri_programs_set')
    expect(tauriLib).toContain('code_execution::tauri_programs_run')
    expect(backend).toContain('tokio::process::Command')
    expect(backend).toContain('.stdin(Stdio::piped())')
    expect(backend).toContain('child.wait_with_output()')
    expect(backend).not.toContain('fake')
    expect(backend).not.toContain('mock')
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
    expect(runtime).toContain(".querySelectorAll('.en-editor-host pre")
    expect(runtime).toContain("run.textContent = 'Run'")
    expect(runtime).toContain("appendStream('stdout'")
    expect(runtime).toContain("appendStream('stderr'")
    expect(runtime).toContain("action === 'programs.run'")
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
})

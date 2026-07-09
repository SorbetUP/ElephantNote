# Executable code blocks

## Goal

ElephantNote keeps ordinary Markdown fenced code blocks as the portable source of truth and adds an optional local execution layer around them.

A shared note therefore remains readable in any Markdown application. In ElephantNote, a reader can select the fenced language, edit the source, run the block, and inspect stdout or stderr directly below it.

## Current syntax

Muya persists the selected language in the Markdown fence:

````markdown
```python
print(6 * 7)
```
````

The execution layer recognizes:

- Python: `python`, `python3`, `py`
- JavaScript / Node.js: `javascript`, `js`, `node`, `nodejs`
- Bash: `bash`, `shell`, `shellscript`
- POSIX shell: `sh`, `posix`
- Ruby: `ruby`, `rb`
- PHP: `php`
- PowerShell: `powershell`, `pwsh`, `ps1`

A language is never presented as available unless a real executable is detected or explicitly configured.

## Editing behavior

The code remains Muya content rather than being replaced by a proprietary notebook editor. ElephantNote adds editor behavior expected inside code:

- `Tab` inserts or applies two-space indentation;
- `Shift+Tab` removes one indentation level;
- `Enter` preserves the current indentation and adds one level after common block openers such as Python `:` or `{`;
- `Cmd+Enter` on macOS and `Ctrl+Enter` elsewhere runs the current block;
- spellcheck, autocorrect and automatic capitalization are disabled inside code.

The execution toolbar is inserted as a sibling after the fenced block, not inside the editable `<pre>`. This prevents runner controls from becoming part of Muya content and avoids cursor disruption or repeated renderer reconstruction while typing.

## Output behavior

Output is session-local and is not written into Markdown.

The output panel behaves like a notebook cell:

- stdout and stderr have separate sections;
- long output scrolls inside the panel;
- the panel opens at the end of the output;
- output can be copied, collapsed or cleared;
- duration, exit status, timeout and truncation are visible in the header.

Settings → Editor → Code execution controls how many final lines are retained. The default is the last 200 lines. The accepted range is 10 to 5,000 lines.

The Rust backend never collects unbounded process output. stdout and stderr are drained concurrently into fixed-size tail buffers while the process is running. When the configured line limit or byte bound is exceeded, earlier output is discarded and only the final lines are returned. This remains bounded even for an infinite printing loop until the execution timeout terminates the process.

## Architecture

### Markdown and Muya

The fenced source and language stay in the note. No proprietary cell format replaces Markdown and Muya remains the editor.

`executableCodeBlocks.js` adds:

- an adjacent execution toolbar;
- local-runtime execution;
- an output panel;
- keyboard behavior for code editing;
- structured renderer diagnostics.

### Runtime contract

The public actions are:

- `programs.list`
- `programs.set`
- `programs.run`

The Tauri bridge maps those actions to Rust commands. The Rust backend detects executable paths, stores device-local environment overrides, starts the selected interpreter directly, writes the code to stdin, drains stdout/stderr concurrently, and returns bounded tail output.

### Settings

Settings → Editor contains a Code execution group built from the same Settings rows, switches, badges, selects and compact inputs as the rest of ElephantNote. It includes:

- a global opt-in switch, disabled by default;
- retained-output line count;
- detected environments and versions;
- per-environment enable/disable controls;
- optional executable name or absolute path overrides.

Environment configuration is device-local because executable paths are not portable between machines.

## Security model

This implementation is **not a sandbox or container**. A program runs with the same operating-system user permissions as ElephantNote.

The implementation reduces accidental exposure by:

- requiring an explicit global opt-in;
- requiring an explicit supported language/runtime mapping;
- spawning the interpreter directly instead of interpolating source into `sh -c`, `cmd /C`, or another generic shell;
- constraining the working directory to the active vault;
- rejecting source larger than 256 KiB;
- stopping execution after 15 seconds;
- draining output into fixed-size tail buffers;
- retaining only the configured number of final lines;
- reporting timeout, truncation and process exit status;
- logging every execution stage in the Tauri development terminal without logging source code.

These controls do not prevent code from reading user-accessible files outside the vault, using the network, launching subprocesses, or modifying the machine. A future hardened mode should use a platform-appropriate sandbox or an OCI/WASI runtime and expose its restrictions explicitly.

## Development logs

Renderer events use `[Code:UI]`. Backend events use `[Code]` and a request identifier. The path is traced from block discovery, language selection and Run click through IPC, validation, executable resolution, process spawn, bounded stream capture, timeout and result rendering.

Source code is not logged. Logs contain metadata such as language, byte counts, paths, duration, PID, exit status, retained line count and discarded byte count.

## Platform behavior

Desktop systems can execute detected local interpreters. On Android and iOS, normal desktop interpreters generally are not available, so environments remain unavailable unless a future mobile-specific runtime is integrated. The interface must not claim otherwise.

## Validation

The branch includes:

- behavioral tests for the MutationObserver freeze regression;
- functional tests for indentation and output-line normalization;
- frontend contracts for the notebook-style UI, shared Settings primitives and sibling toolbar placement;
- Rust tests for language aliases, output-line bounds and fixed-size tail capture;
- a Rust test that runs a real Python process and verifies `print(6 * 7)` produces `42` when Python is installed.

## Deliberate follow-ups

The following are not represented as complete:

- persisted or shareable execution outputs;
- rich image, HTML, table or plot outputs;
- stateful kernels shared between blocks;
- package/virtual-environment creation and dependency installation;
- container, WASI or OS sandbox isolation;
- a manual stop button before the backend timeout;
- run-all / run-above / run-below;
- execution counts and dependency ordering.

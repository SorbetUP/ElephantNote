# Executable code blocks

## Goal

ElephantNote keeps ordinary Markdown fenced code blocks as the portable source of truth and adds an optional local execution layer around them.

A shared note therefore remains readable in any Markdown application. In ElephantNote, a reader can select the fenced language, edit the source, run the block, and inspect stdout or stderr directly below it.

## Current syntax

Muya already persists the selected language in the Markdown fence:

````markdown
```python
print(6 * 7)
```
````

The execution layer reads that language identifier. The first implementation recognizes:

- Python: `python`, `python3`, `py`
- JavaScript / Node.js: `javascript`, `js`, `node`, `nodejs`
- Bash: `bash`, `shell`, `shellscript`
- POSIX shell: `sh`, `posix`
- Ruby: `ruby`, `rb`
- PHP: `php`
- PowerShell: `powershell`, `pwsh`, `ps1`

A language is never presented as available unless a real executable is detected or explicitly configured.

## Architecture

### Markdown and Muya

The fenced source and language stay in the note. No proprietary cell format replaces Markdown and Muya remains the editor.

`executableCodeBlocks.js` enhances rendered fenced blocks with:

- the detected language;
- a `Run` action;
- an adjacent stdout/stderr panel;
- exit status, duration, timeout and truncation information.

The live output is currently session-local and is not written into the Markdown document. This avoids silently modifying shared documentation and avoids stale output being mistaken for a verified result. Persisted, signed or reproducible outputs should be implemented as a separate opt-in format rather than injected into ordinary prose.

### Runtime contract

The existing public actions are used rather than creating a second API:

- `programs.list`
- `programs.set`
- `programs.run`

The Tauri bridge maps those actions to Rust commands. The Rust backend detects executable paths, stores local environment overrides, starts the selected interpreter directly, writes the code to stdin, and captures stdout/stderr.

### Settings

Settings → Editor contains a Code execution section with:

- a global opt-in switch, disabled by default;
- detected environments and versions;
- per-environment enable/disable controls;
- an optional executable name or absolute path override.

Environment configuration is device-local because executable paths are not portable between machines.

## Security model

This first implementation is **not a sandbox or container**. A program runs with the same operating-system user permissions as ElephantNote.

The implementation reduces accidental exposure by:

- requiring an explicit global opt-in;
- requiring an explicit supported language/runtime mapping;
- spawning the interpreter directly instead of interpolating the source into `sh -c`, `cmd /C`, or another generic shell;
- constraining the working directory to the active vault;
- rejecting source larger than 256 KiB;
- stopping execution after 15 seconds;
- bounding captured output to 1 MiB per stream;
- reporting timeout, truncation and process exit status;
- logging start and completion in the Tauri development terminal.

These controls do not prevent code from reading user-accessible files outside the vault, using the network, launching subprocesses, or modifying the machine. A future hardened mode should use a platform-appropriate sandbox or an OCI/WASI runtime and expose its restrictions explicitly.

## Platform behavior

Desktop systems can execute detected local interpreters. On Android and iOS, normal desktop interpreters generally are not available, so environments remain unavailable unless a future mobile-specific runtime is integrated. The interface must not claim otherwise.

## Validation

The branch includes:

- frontend contract tests checking the real Tauri command path, UI integration and safety limits;
- Rust unit tests for language aliases and output bounds;
- a Rust test that runs a real Python process and verifies `print(6 * 7)` produces `42` when Python is installed.

Skipping the optional Python process test on a machine without Python does not skip the unconditional runtime contract tests.

## Deliberate follow-ups

The following are not represented as complete in this first branch:

- persisted or shareable execution outputs;
- rich image, HTML, table or plot outputs;
- stateful kernels shared between blocks;
- package/virtual-environment creation and dependency installation;
- container, WASI or OS sandbox isolation;
- stop/cancel control before the timeout;
- run-all / run-above / run-below;
- execution counts and dependency ordering.

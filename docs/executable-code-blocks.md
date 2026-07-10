# Executable code blocks

## Goal

ElephantNote keeps ordinary Markdown fenced code blocks as the portable source of truth and adds an optional local execution layer around them.

A shared note therefore remains readable in any Markdown application. In ElephantNote, a reader can select the fenced language, edit the source, run the block, stop it, and inspect stdout or stderr directly below it.

## Current syntax

Muya persists the selected language in the Markdown fence:

````markdown
```python
print(6 * 7)
```
````

The execution layer recognizes Python, JavaScript/Node.js, Bash, POSIX shell, Ruby, PHP and PowerShell aliases. A language is never presented as available unless a real executable is detected or explicitly configured.

## Editing behavior

The code remains Muya content rather than being replaced by a proprietary notebook editor. ElephantNote adds:

- `Tab` indentation;
- `Shift+Tab` outdent;
- automatic indentation on `Enter`;
- `Cmd+Enter` on macOS or `Ctrl+Enter` elsewhere to run the current block;
- the same shortcut stops the block while it is running;
- disabled spellcheck, autocorrect and automatic capitalization inside code.

The execution controls and output are rendered in a dedicated portal attached to `document.body`, outside Muya's editable and serialized DOM. The portal is positioned beside and below the corresponding fenced block. This prevents the controls from changing the Markdown or being removed when Muya replaces a transient `<pre>` node.

The compact control shows the language and a triangular Run icon. During execution the icon becomes a square Stop control. Pointer and click diagnostics are logged before dispatching the Tauri command.

## Output behavior

Output is session-local and is not written into Markdown.

The output panel:

- uses editor-theme-derived surfaces rather than Settings colors;
- remains readable in light and dark themes;
- separates stdout and stderr;
- scrolls internally for long output;
- opens at the final output;
- supports Copy, Collapse/Expand and Clear;
- shows duration, exit status, timeout, interruption and truncation.

The output state is stored separately from Muya's transient DOM. If Muya replaces the `<pre>` after blur, editing or deletion elsewhere in the note, ElephantNote matches the replacement by editor root, source fingerprint and document ordinal, then repositions the existing controls and result. Clicking outside does not clear an output; only Clear does.

Settings → Editor → Code execution controls how many final lines are retained. The default is 200 and the accepted range is 10 to 5,000 lines.

## Real process interruption

Each execution has a unique identifier registered in the Rust backend. Clicking the square Stop control sends a cancellation request to the corresponding process.

On Unix platforms, ElephantNote first sends `SIGINT`, matching the normal semantics of `Ctrl+C`. It waits briefly for a graceful exit and then force-terminates the process if it ignores the interrupt. Platforms without a Unix signal API use the force-termination fallback.

The final result is marked as interrupted and retains the bounded output produced before termination.

## Bounded output

The backend never collects unbounded process output. stdout and stderr are drained concurrently into fixed-size tail buffers while execution is running.

- each stream retains at most 1 MiB;
- earlier bytes are discarded continuously;
- only the configured final lines are returned;
- infinite printing loops remain memory-bounded;
- timeout and manual interruption both kill and reap the child process;
- responses report retained lines and discarded bytes/lines.

## Security model

This implementation is **not a sandbox or container**. A program runs with the same operating-system user permissions as ElephantNote.

The implementation reduces accidental exposure by:

- requiring explicit global opt-in;
- requiring an explicit supported runtime mapping;
- spawning interpreters directly rather than using a generic shell;
- constraining the working directory to the active vault;
- rejecting source larger than 256 KiB;
- stopping execution after 15 seconds;
- providing manual interruption;
- retaining bounded output tails;
- logging execution stages without logging source code.

These controls do not prevent code from accessing user-readable files, using the network, launching subprocesses or modifying the machine.

## Validation

The branch includes tests for:

- controls and output remaining outside the editable Muya tree;
- Markdown text remaining unchanged when controls are mounted;
- an actual button click dispatching `tauri_programs_run`;
- stable state and output across replacement of the fenced `<pre>`;
- the Run triangle changing to a Stop square and sending a real stop request;
- indentation and execution shortcuts;
- output line-limit normalization;
- fixed-size stream capture;
- stop-request delivery;
- real Python execution;
- real interruption of a running Python loop when Python is installed.

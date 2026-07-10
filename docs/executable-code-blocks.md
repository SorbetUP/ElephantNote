# Executable code blocks

## Goal

ElephantNote keeps ordinary Markdown fenced code blocks as the portable source of truth and adds optional local execution without turning notes into a proprietary notebook format.

A shared note therefore remains readable in any Markdown application. In ElephantNote, a reader can select the fenced language, edit the source, run the block, stop it, and inspect stdout or stderr directly below it.

## Current syntax

Muya persists the selected language in the Markdown fence:

````markdown
```python
print(6 * 7)
```
````

The execution layer recognizes Python, JavaScript/Node.js, Bash, POSIX shell, Ruby, PHP and PowerShell aliases. A language is never presented as available unless a real executable is detected or explicitly configured.

## Inline component architecture

Each executable block uses Muya's existing code-block host as one visual component. The direct children are ordered as:

1. the runtime toolbar;
2. the original editable `<pre>` code block;
3. the session-local output section.

The toolbar and output are `contenteditable="false"` siblings of the `<pre>`. They are never inserted inside the source node. The host owns the single border, background and border radius, so code and output cannot become two independent floating windows.

There is no visual layer attached to `document.body`, no viewport-coordinate positioning, no `left` or `top` updates, and no scroll listener. The whole component participates in the note's normal document flow. Scrolling the note therefore moves code and output together exactly like any other block.

The original Muya language/copy/fence chrome is hidden after it is identified. A stable runtime toolbar replaces it with:

- a real language `<select>`;
- Copy;
- Run, which becomes Stop while the process is active.

Changing the runtime selector updates Muya's native language control, the `language-*` classes and the related `input`/`change` events so the Markdown fence remains the persisted source of truth.

## Editing behavior

The code remains Muya content rather than being replaced by a proprietary notebook editor. ElephantNote adds:

- `Tab` indentation;
- `Shift+Tab` outdent;
- automatic indentation on `Enter`;
- `Cmd+Enter` on macOS or `Ctrl+Enter` elsewhere to run the current block;
- the same shortcut stops the block while it is running;
- disabled spellcheck, autocorrect and automatic capitalization inside code.

## Output behavior

Output is session-local and is not written into Markdown.

The output section:

- expands inside the same code-block shell;
- uses the code block's computed surface and text colors;
- remains readable in light and dark themes;
- separates stdout and stderr;
- scrolls internally for long output;
- supports Copy, Collapse/Expand and Clear;
- shows duration, exit status, timeout, interruption and truncation.

Output state is stored independently from Muya's transient `<pre>`. If Muya replaces the host or source node, ElephantNote matches the replacement by editor root, source fingerprint and document ordinal, then remounts the same state inside the new host. Clicking outside does not clear output; only Clear does.

Settings → Editor → Code execution controls how many final lines are retained. The default is 200 and the accepted range is 10 to 5,000 lines.

## Mutation and lifecycle behavior

Runtime-owned mutations are ignored by the editor topology observer. Rendering, collapsing, expanding, clearing or scrolling output does not trigger a code-block rescan. Syntax-highlighting span churn is also ignored.

Real code-host additions and replacements are debounced. Removing a complete host schedules one lifecycle scan and delayed state cleanup, preventing detached state or orphan controls without creating a mutation feedback loop.

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

The active V6 suites verify:

- toolbar, source and output are direct children of one Muya host;
- no visual runtime layer exists under `document.body`;
- no floating positioning styles are written;
- Markdown source text remains unchanged when runtime UI mounts;
- language selection updates the native Muya control and fence classes;
- a real button click dispatches `tauri_programs_run`;
- code and output state survive complete Muya host replacement;
- Run changes to Stop and sends a real stop request;
- output rendering, collapse, expansion, clearing and scroll cause zero scans;
- runtime and syntax-highlighting mutation churn cause zero scans;
- deleting a block removes its state and leaves no orphan UI;
- multiple blocks each own exactly one toolbar and one output section;
- indentation and execution shortcuts;
- output line-limit normalization;
- fixed-size stream capture;
- stop-request delivery;
- real Python execution;
- real interruption of a running Python loop when Python is installed.

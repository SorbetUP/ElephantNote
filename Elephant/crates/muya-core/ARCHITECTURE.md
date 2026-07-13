# Muya core architecture

`muya-core` is the DOM-independent source of truth for the future editor. It must not depend on Tauri, WebView APIs, Vue, Snabbdom, browser selections or filesystem services.

## Ownership layers

1. `model`: stable document nodes, IDs and UTF-16 observable source ranges.
2. `syntax`: ordered catalogue of Markdown block and inline constructions.
3. `parser`: Markdown to `Document`.
4. `serializer`: `Document` to Markdown, HTML or plain text.
5. `edit`: semantic commands, atomic operations and transactions.
6. `features`: isolated structural editing for complex constructs such as lists and tables.
7. `selection`: logical selection independent from DOM ranges.
8. `history`: invertible transactions and typing groups.
9. `view`: logical patches consumed by the browser adapter.

## Current executable parser slice

The Rust parser and Markdown serializer currently execute these block constructions:

- ATX headings;
- Setext headings, canonicalized to ATX on serialization;
- paragraphs;
- thematic breaks;
- consecutive blockquote lines;
- fenced code blocks with language information;
- unordered lists;
- ordered lists with their starting number;
- task lists;
- structurally nested lists with mixed list kinds and preserved indentation;
- GFM-style tables with column alignment.

The inline tokenizer currently executes:

- escaped punctuation;
- code spans;
- images;
- inline links with optional titles;
- strong emphasis;
- emphasis;
- strikethrough;
- hard and soft line breaks;
- text fallback.

Inline parsing is recursive inside headings, paragraphs, blockquotes, list items, links and table cells. Fenced code content follows a separate literal path and is never tokenized as Markdown inline content. Empty editable containers receive an explicit `Text("")` node so selections always have an addressable target.

## Current executable editing slice

The model-level editing layer currently contains:

- DOM-independent logical selections using UTF-16 offsets;
- same-node forward and backward selection ordering;
- replacement and deletion across direct sibling text endpoints in one inline container;
- safe removal of fully covered inline subtrees between those endpoints;
- `InsertText`, `DeleteBackward` and `InsertParagraph` commands;
- `GraphemeCommand::DeleteBackward`, which removes one extended Unicode grapheme and delegates structural Backspace at offset zero;
- `ToggleStrong`, `ToggleEmphasis` and `ToggleStrike` commands for same-text-node selections;
- complete unwrapping when an entire single-text mark is selected;
- plain and rich paragraph splitting;
- paragraph splitting from inside nested inline wrappers by cloning only the right-side wrapper chain;
- movement of following inline subtrees at every nesting level without changing existing IDs;
- plain and rich paragraph joining;
- list-item splitting for unordered, ordered and task lists;
- new task items created unchecked;
- Enter on an empty item lifting its paragraph out of the list;
- middle empty items splitting one list into left and right lists;
- ordered right-side lists preserving the correct continuation number;
- Backspace-based merging with the previous list item;
- removal of the first list marker by lifting the same paragraph out of the list;
- automatic removal of a list container that becomes empty;
- structural nested-list parsing and serialization;
- `ListCommand::IndentItem` and `ListCommand::OutdentItem` with exact undo restoration;
- reuse of compatible existing nested lists and removal of nested containers that become empty;
- `TableCommand` operations for inserting and deleting body rows;
- `TableCommand` operations for inserting and deleting columns across all rows;
- table cell alignment and header flags preserved during structural edits;
- `TableNavigationCommand::NextCell` and `PreviousCell` for logical Tab navigation;
- automatic body-row insertion when navigating forward from the last cell;
- invertible subtree movement between containers;
- `SetParagraph` and `SetHeading(1..=6)` block transformations;
- UTF-16 boundary validation that rejects offsets inside surrogate pairs;
- invertible text replacement, leaf insertion and block-kind operations;
- detachable subtree snapshots with stable IDs and parent/child topology;
- invertible subtree removal, restoration and movement;
- transactions applied to a cloned document before commit, preventing partially applied failures;
- revision increments on successful transactions;
- bounded transaction-based undo and redo history;
- ordered logical view patches, including subtree restoration and movement patches.

Structural undo and redo restore the same node IDs, topology, inline order, list nesting and table structure. Nested splits currently reject caret positions exactly at the start or end of a marked text node until empty-wrapper normalization is introduced. Cross-node replacement requires both endpoint text nodes to be direct siblings in the same container. Selection endpoints inside different nested marks, partial mark unwrapping, IME grouping and DOM patch application remain future slices.

The parser, serializer and editing slices have Rust unit tests. They have not yet passed full differential characterization against the original Muya JavaScript behavior, so they are not eligible runtime replacements yet.

## Markdown construction catalogue

Block constructions are registered in precedence order:

- frontmatter;
- fenced and indented code;
- ATX and Setext headings;
- thematic break;
- blockquote;
- task, ordered and unordered lists;
- table;
- HTML block;
- math block;
- diagram;
- footnote definition;
- reference definition;
- paragraph fallback.

Inline constructions are also registered in precedence order:

- escape;
- code span;
- image and link forms;
- autolink;
- strong, emphasis and strikethrough;
- inline math and HTML;
- emoji;
- superscript and subscript;
- footnote reference;
- hard and soft line breaks;
- text fallback.

A feature's syntax recognizer must not own editing, rendering or DOM behavior. Complex features use isolated modules such as `features/list`, `features/table` and `features/table_navigation` for semantic commands.

## Adapter boundary

The browser adapter remains responsible for:

- keyboard, beforeinput and composition events;
- mapping physical Tab/Shift+Tab and Backspace events to semantic Rust commands;
- DOM creation and logical patch application;
- browser `Selection` and `Range` conversion;
- geometry, scrolling and floating widgets;
- asynchronous image, KaTeX and Mermaid integration.

Tauri remains responsible for native files, operating-system integration and services. Neither adapter may become the canonical document model.

## Migration invariant

A JavaScript capability is removed only when its complete Rust slice is active:

1. syntax recognition;
2. model representation;
3. serialization;
4. semantic editing commands;
5. selection transformation;
6. undo/redo behavior;
7. view patches;
8. differential characterization against original Muya.

File-by-file translations remain useful for inventory and parity, but runtime cutover is performed capability by capability.

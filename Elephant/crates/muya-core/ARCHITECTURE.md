# Muya core architecture

`muya-core` is the DOM-independent source of truth for the future editor. It must not depend on Tauri, WebView APIs, Vue, Snabbdom, browser selections or filesystem services.

## Ownership layers

1. `model`: stable document nodes, IDs and UTF-16 observable source ranges.
2. `syntax`: ordered catalogue of Markdown block and inline constructions.
3. `parser`: Markdown to `Document`.
4. `serializer`: `Document` to Markdown, HTML or plain text.
5. `edit`: semantic commands, atomic operations and transactions.
6. `selection`: logical selection independent from DOM ranges.
7. `history`: invertible transactions and typing groups.
8. `view`: logical patches consumed by the browser adapter.

## Current executable slice

The Rust parser and Markdown serializer currently execute these block constructions:

- ATX headings;
- Setext headings, canonicalized to ATX on serialization;
- paragraphs;
- thematic breaks;
- consecutive blockquote lines;
- fenced code blocks with language information;
- simple unordered lists;
- simple ordered lists with their starting number;
- task lists;
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

Inline parsing is recursive inside headings, paragraphs, blockquotes, list items, links and table cells. Fenced code content follows a separate literal path and is never tokenized as Markdown inline content.

This slice has Rust unit and round-trip tests. It has not yet passed full differential characterization against the original Muya JavaScript parser, so it is not an eligible runtime replacement yet.

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

A feature's syntax recognizer must not own editing, rendering or DOM behavior. Complex features such as tables receive separate `features/table` modules when their editing commands are introduced.

## Adapter boundary

The browser adapter remains responsible for:

- keyboard, beforeinput and composition events;
- DOM creation and patch application;
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

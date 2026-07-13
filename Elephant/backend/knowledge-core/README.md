# ElephantNote Knowledge Core

`elephantnote-knowledge-core` is the native Rust knowledge engine for ElephantNote.

## Invariants

- User Markdown files are the canonical source of truth.
- All indexes are derived and rebuildable.
- Hidden folders are never indexed as user notes.
- Generated knowledge data lives under `.elephantnote/knowledge/`.
- No embedding model is required.
- Generated relations and citations must keep source evidence.
- Chat writes require explicit approval and an expected content hash.
- The core crate does not depend on Tauri, Vue, or the renderer.
- The graph API returns the complete projected graph; renderer code must not apply a silent note-count cap.
- Wikilinks inside fenced or inline code are data, not knowledge relations.
- App-local GGUF wiki generation is routed through the bundled llama runtime.

## Current implementation

- structural Markdown analysis;
- stable document, section, and chunk identifiers;
- exact byte offsets for source navigation and guarded edits;
- block-aware chunking that preserves fenced code blocks;
- explicit wikilink extraction outside Markdown code spans and fences;
- SQLite storage with FTS5 chunk search;
- incremental vault rebuild based on BLAKE3 content hashes;
- relation refresh for unchanged notes so parser improvements clean stale derived edges;
- stale-document pruning;
- validated chat action contracts.

## Validation contracts

- renderer integration tests exercise a graph containing 1,389 notes and require all 1,389 to remain visible to the graph API;
- browser tests run the real Tauri web renderer with a controlled native-command mock;
- Rust tests verify that code matrices do not create wikilinks and that incremental rebuilds remove stale derived relations;
- Wiki routing tests verify that `app-local` GGUF selections reach the bundled llama runtime;
- focused ElephantNote contract tests use the installed `Elephant/node_modules/.bin/vitest` runtime rather than relying on an unavailable root-level binary;
- the critical-flow guard follows the current Iroh runtime, including two real endpoints, three-way planning, deletion propagation, conflict preservation, external-binary independence, and structured synchronization logs.

## Planned modules

- canonical tag taxonomy and aliases;
- structured model-provider interface;
- title and tag suggestions with evidence;
- typed knowledge relations;
- graph projection for the existing graph UI;
- cited wiki proposals and incremental updates;
- approval and audit log for chat actions;
- migration away from the legacy embedding/search/wiki implementations.

## Chat action safety

Read-only search can execute directly. Creating a wiki or changing a note requires approval. Existing-note mutations must include the content hash observed by the model, preventing an older chat response from overwriting a newer user edit.

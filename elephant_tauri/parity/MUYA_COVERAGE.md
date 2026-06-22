# Muya parity coverage

This file is the migration contract for replacing Muya behavior with Rust/Tauri behavior without changing the Vue UI.

Reference source: the Electron/MarkText Muya implementation is the source of truth. The Rust engine is not considered equivalent until every observable item below has fixtures and tests.

## Status scale

- 0%: not started.
- 25%: basic shape exists, but incomplete.
- 50%: common cases pass unit fixtures.
- 75%: edge cases and UI contract mostly covered.
- 100%: covered by parity fixtures and verified against the Electron/Muya behavior.

## Source comparison layer

The deterministic engine now has five fixture/snapshot layers:

- `muya_deterministic_cases.json`: Markdown inputs and expected deterministic fields.
- `muya_edge_cases.json`: CommonMark/Muya edge-case inputs for autolinks, escapes, heading attrs and fence variants.
- `muya_source_snapshots.json`: source-of-truth snapshots consumed by Rust snapshot tests.
- `muya_source_snapshots_meta.json`: generation metadata, including whether the snapshots came from the real renderer or the fallback contract adapter.
- Rust snapshot tests: compare the Rust deterministic contracts against these snapshots.

`pnpm muya:snapshots` regenerates contract snapshots for development.

The strict 100% path is:

```bash
pnpm add -D @muyajs/core
node scripts/generate-muya-source-snapshots.mjs --strict-real --adapter=scripts/adapters/real-muya-renderer.mjs
bash scripts/tauri-rust-check.sh
```

`--strict-real` must fail if the adapter or `@muyajs/core` is unavailable. The engine is only allowed to claim 100% when `muya_source_snapshots_meta.json` reports `mode: real-electron-muya-renderer` and all Rust tests pass.

## Markdown engine parity

| Area | Current estimate | Notes |
|---|---:|---|
| CommonMark block parsing | 78% | Headings, paragraphs, blockquotes, lists, HR, code blocks and fence variants exist. Nested list metadata, deterministic fixtures, edge fixtures and source-snapshot comparisons exist. |
| GFM tables | 78% | Render/token support exists, row/column contracts exist, deterministic alignment/export fixtures exist, and source-snapshot comparison exists. |
| Task lists | 78% | HTML classes are normalized to `task-list` and `task-list-item`; tokens expose `task_marker`; nested checked item metadata exists. |
| Inline marks | 80% | Strong/emphasis/strike/code/link tokens exist, nested inline mark deterministic fixtures exist, and source-snapshot comparison exists. |
| Links and images | 78% | Direct links, reference-style links/images and autolinks are covered by extras/edge fixtures. Advanced title/escaping cases still need expansion. |
| Footnotes | 78% | Definitions, references, footnote HTML contract, fixtures and source-snapshot comparison now exist. |
| HTML blocks/inline HTML | 70% | Token coverage and sanitization contract exist. Dangerous payload tests are kept in Rust tests, not JSON fixtures. |
| Math blocks/inline math | 75% | Inline and block math emit extras plus KaTeX-like HTML contract. A strict real-Muya adapter scaffold now exists but must be run with `@muyajs/core`. |
| Diagrams | 75% | Mermaid/flowchart/sequence/vega/plantuml fences emit extras plus diagram HTML contract. A strict real-Muya adapter scaffold now exists but real preview parity still needs generated snapshots. |
| Frontmatter | 78% | YAML-like scalars, booleans, numbers, null, inline arrays, block arrays, simple objects and source-snapshot comparison are covered. Full YAML spec is not implemented. |
| Escapes and attributes | 75% | Escaped Markdown punctuation, autolink normalization, heading attributes and fence metadata now have edge contracts and tests. |
| Export HTML contract | 75% | Rendering exists; task classes, math/diagram placeholders, reference links, footnotes, sanitized HTML, table alignment, edge cases, source snapshots and a real adapter scaffold are covered. Exact MarkText export normalization requires strict generated snapshots. |

## Editor interaction parity

| Area | Current estimate | Notes |
|---|---:|---|
| Cursor/selection model | 20% | Pure cursor movement and selection-extension contracts exist; DOM selection parity is not verified yet. |
| Input rules | 25% | Contracts exist for headings, lists, tasks, blockquote, HR, code fence and math block. Transform application is still not fully ported. |
| Backspace/delete behavior | 20% | Text-buffer backspace/remove-next and selection replacement are covered. Structural Markdown behavior is not complete. |
| Arrow navigation | 20% | Left/right/up/down/line-start/line-end contracts exist. Block-aware navigation is not complete. |
| Clipboard copy/cut/paste | 25% | Copy as Markdown, copy as HTML and paste replacement contracts exist. Full HTML paste normalization is not complete. |
| Drag/drop images/files | 0% | Not ported. |
| Table editing controls | 25% | Insert row/column and table contract functions exist. Full Muya table UI behavior is not complete. |
| Image selection/editing | 20% | Image-under-cursor detection exists. Resize/edit UI behavior is not complete. |
| History/undo/redo | 25% | Basic undo/redo stacks exist for Rust edit state. Full grouped transaction parity is not complete. |
| IME/composition | 20% | Start/update/commit/cancel composition contracts exist. Browser composition-event parity is not verified yet. |

## App migration parity

| Area | Current estimate | Notes |
|---|---:|---|
| Vue UI reuse | 80% | Tauri uses the same AppShell path again. Pixel diff tests are still missing. |
| Runtime bridge | 40% | Muya editor contract commands are now exposed; many Electron APIs are still stubs. |
| Notes read/write | 40% | Basic Rust commands exist. Full tab/editor integration still incomplete. |
| Vault layout | 65% | Hidden/visible layout exists. More migration tests needed. |
| Search | 15% | Basic query/rebuild exists. Not equivalent to Electron yet. |
| Attachments/images | 10% | Basic hidden assets storage exists. UI parity incomplete. |
| Drawings/Excalidraw | 5% | Placeholder scene commands exist. |
| Sync | 5% | Status/plan placeholders only. |

## Honest global estimate

- Muya deterministic Markdown engine: about 78-85%.
- Muya full editor behavior: about 20-30%.
- Full Tauri replacement of Electron app: about 22-28%.

The engine is not allowed to claim 100% until strict real snapshots are generated through `scripts/adapters/real-muya-renderer.mjs`, `muya_source_snapshots_meta.json` reports `real-electron-muya-renderer`, and every edge-case row stays green in Rust.

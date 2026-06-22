# Muya parity coverage

This file is the migration contract for replacing Muya behavior with Rust/Tauri behavior without changing the Vue UI.

Reference source: the Electron/MarkText Muya implementation is the source of truth. The Rust engine is not considered equivalent until every observable item below has fixtures and tests.

## Status scale

- 0%: not started.
- 25%: basic shape exists, but incomplete.
- 50%: common cases pass unit fixtures.
- 75%: edge cases and UI contract mostly covered.
- 100%: covered by parity fixtures and verified against the Electron/Muya behavior.

## Markdown engine parity

| Area | Current estimate | Notes |
|---|---:|---|
| CommonMark block parsing | 65% | Headings, paragraphs, blockquotes, lists, HR and code blocks exist. Nested list metadata and deterministic fixtures exist. |
| GFM tables | 70% | Render/token support exists, row/column contracts exist, and deterministic alignment/export fixtures exist. |
| Task lists | 75% | HTML classes are normalized to `task-list` and `task-list-item`; tokens expose `task_marker`; nested checked item metadata exists. |
| Inline marks | 70% | Strong/emphasis/strike/code/link tokens exist, and nested inline mark deterministic fixtures exist. More exotic nesting still needs source comparison. |
| Links and images | 70% | Direct and reference-style links/images are covered by extras and parity fixtures. Advanced title/escaping cases still need expansion. |
| Footnotes | 70% | Definitions, references and footnote HTML contract now exist with fixtures. Exact MarkText export still needs source comparison. |
| HTML blocks/inline HTML | 65% | Token coverage and sanitization contract exist. Dangerous payload tests are kept in Rust tests, not JSON fixtures. |
| Math blocks/inline math | 65% | Inline and block math emit extras plus KaTeX-like HTML contract. Real KaTeX rendering parity is not done. |
| Diagrams | 65% | Mermaid/flowchart/sequence/vega/plantuml fences emit extras plus diagram HTML contract. Real preview renderer parity is not done. |
| Frontmatter | 70% | YAML-like scalars, booleans, numbers, null, inline arrays, block arrays and simple objects are covered. Full YAML spec is not implemented. |
| Export HTML contract | 65% | Rendering exists; task classes, math/diagram placeholders, reference links, footnotes, sanitized HTML and table alignment are covered. Exact MarkText export normalization still needs source comparison. |

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

- Muya deterministic Markdown engine: about 65-75%.
- Muya full editor behavior: about 20-30%.
- Full Tauri replacement of Electron app: about 22-28%.

The engine is not allowed to claim 100% until every line above is backed by parity fixtures and compared against the Electron/Muya source behavior.

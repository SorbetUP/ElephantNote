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
| CommonMark block parsing | 60% | Headings, paragraphs, blockquotes, lists, HR and code blocks exist. Nested list metadata fixtures started. |
| GFM tables | 55% | Render/token support exists through pulldown-cmark. Row/column contract functions and fixtures started. Full table editor parity is not done. |
| Task lists | 70% | HTML classes are normalized to `task-list` and `task-list-item`; tokens expose `task_marker`; nested checked item metadata exists. |
| Inline marks | 55% | Strong/emphasis/strike/code/link tokens exist. Nested mark edge cases need fixtures. |
| Links and images | 65% | Direct and reference-style links/images are now covered by extras and parity fixtures. Advanced titles/edge cases still need expansion. |
| Footnotes | 45% | Token coverage exists; rendering/parity fixtures still need expansion. |
| HTML blocks/inline HTML | 45% | Token coverage exists. Sanitization/export rules not complete. |
| Math blocks/inline math | 35% | Rust now detects inline `$...$` and block `$$...$$`, emits extras and placeholder HTML. Full KaTeX/Muya preview parity is not done. |
| Diagrams | 35% | Rust now detects mermaid/flowchart/sequence/vega/plantuml fences, emits extras and placeholder HTML. Full preview parity is not done. |
| Frontmatter | 45% | Simple key/value, booleans and arrays supported. Full YAML compatibility not implemented. |
| Export HTML contract | 40% | Rendering exists; task classes, math/diagram placeholders, reference links and nested-list metadata are now covered. MarkText/Muya export normalization is not fully matched. |

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

- Muya deterministic Markdown engine: about 55-65%.
- Muya full editor behavior: about 20-30%.
- Full Tauri replacement of Electron app: about 22-28%.

The next milestone is not "claim 100%". The next milestone is: every Muya feature above must have a fixture and a parity assertion. Only then can the percentage become objective.

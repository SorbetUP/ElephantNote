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
| GFM tables | 50% | Render/token support exists through pulldown-cmark. Alignment fixtures started. Editing behavior is not ported. |
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
| Cursor/selection model | 0% | Still handled by existing Vue/Muya UI. No Rust replacement. |
| Input rules | 0% | Not ported. |
| Backspace/delete behavior | 0% | Not ported. |
| Arrow navigation | 0% | Not ported. |
| Clipboard copy/cut/paste | 0% | Not ported. |
| Drag/drop images/files | 0% | Not ported. |
| Table editing controls | 0% | Not ported. |
| Image selection/editing | 0% | Not ported. |
| History/undo/redo | 0% | Not ported. |
| IME/composition | 0% | Not ported. |

## App migration parity

| Area | Current estimate | Notes |
|---|---:|---|
| Vue UI reuse | 80% | Tauri uses the same AppShell path again. Pixel diff tests are still missing. |
| Runtime bridge | 35% | Basic bridge exists; many Electron APIs are still stubs. |
| Notes read/write | 40% | Basic Rust commands exist. Full tab/editor integration still incomplete. |
| Vault layout | 65% | Hidden/visible layout exists. More migration tests needed. |
| Search | 15% | Basic query/rebuild exists. Not equivalent to Electron yet. |
| Attachments/images | 10% | Basic hidden assets storage exists. UI parity incomplete. |
| Drawings/Excalidraw | 5% | Placeholder scene commands exist. |
| Sync | 5% | Status/plan placeholders only. |

## Honest global estimate

- Muya deterministic Markdown engine: about 55-65%.
- Muya full editor behavior: about 10-15%.
- Full Tauri replacement of Electron app: about 20-25%.

The next milestone is not "claim 100%". The next milestone is: every Muya feature above must have a fixture and a parity assertion. Only then can the percentage become objective.

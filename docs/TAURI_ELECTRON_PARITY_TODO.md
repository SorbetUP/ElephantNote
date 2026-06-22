# Tauri / Electron parity TODO

This document tracks the current gap between the historical Electron app behavior and the new Tauri renderer/runtime. It must be treated as the main stabilization checklist before adding more cosmetic features or artificial tests.

Status legend:

- `[ ]` not started
- `[~]` partially implemented or unclear
- `[x]` fixed and covered by a real test

## 0. Testing policy reset

The current unit test count is not enough proof of product quality. Some generated tests were too far from the real application. The next tests must import real stores, real components, real renderer bootstrap code, or run the real app in an integration harness.

- [ ] Remove remaining artificial/generated tests that only test local fake harnesses and do not import production code.
- [ ] Keep useful low-level tests that caught real regressions: path facade, renderer diagnostics, markdown parsing, Muya input rules, model helper imports, vault store workflows.
- [ ] Add real component tests that mount actual Vue components instead of fake UI models.
- [ ] Add a real renderer bootstrap test that fails if the app mounts a blank screen.
- [ ] Add a minimal Tauri integration/smoke test that launches the frontend and checks the app shell is not blank.
- [ ] Add a minimal Electron integration/smoke test that launches Electron and checks the app shell is not blank.
- [ ] Add visual regression tests only after the functional runtime is stable.

## 1. Critical runtime and build blockers

### 1.1 Electron build blockers

Observed problem: `pnpm dev` fails because main process imports a missing dependency.

- [x] Add `electron-log` to runtime dependencies.
- [ ] Check and fix missing `@hfelix/electron-localshortcut` dependency imported by `src/main/keyboard/shortcutHandler.js`.
- [ ] Audit all `src/main/**` imports against `package.json` dependencies.
- [ ] Add a build-time test or script that runs `electron-vite dev/build` import resolution in CI.
- [ ] Add a dependency guard test that fails if a source file imports a package not declared in `package.json`.

### 1.2 Tauri blank page / renderer bootstrap

Observed problem: the page can become entirely white while unit tests are green.

- [ ] Add a renderer bootstrap smoke test that imports and mounts the real app root.
- [ ] Add a Tauri smoke test that verifies the DOM contains the expected app shell after launch.
- [ ] Fail the test if the root element has no visible content after boot.
- [ ] Forward renderer boot errors to terminal in dev mode with enough context.
- [ ] Add a visible dev error overlay for renderer import/runtime crashes.
- [ ] Add a test for `window.__ELEPHANT_DEBUG_LOGS__` content after boot.

### 1.3 Missing export / model page import crashes

Observed problem: `SyntaxError: Importing binding name 'getDownloadOption' is not found` produced a blank page.

- [x] Restore/export `getDownloadOption` from `modelsViewHelpers.js`.
- [x] Add a unit test importing the real `ModelsView.vue` and `getDownloadOption`.
- [ ] Add equivalent import smoke tests for every major page: Notes, Wiki, Graph, Models, Settings, Search, Chat, Dashboard, Calendar, Canvas.
- [ ] Add a rule: every component-level helper imported by a `.vue` file must have a direct import smoke test.

## 2. Notes list and note cards

### 2.1 Note text not displayed in cards

Observed problem: note cards show metadata/frontmatter or almost no real content; actual note text is not displayed correctly.

- [ ] Inspect the path from backend note file content to `entries` payload.
- [ ] Ensure note card preview uses stripped markdown body, not raw YAML/frontmatter.
- [ ] Strip frontmatter robustly from previews.
- [ ] Strip markdown title heading from preview when it duplicates card title.
- [ ] Preserve meaningful body text, lists, code, and first paragraph preview.
- [ ] Add real tests for `getNoteCardExcerpt()` with actual markdown files.
- [ ] Add integration test: create note with body, reload vault, card preview displays body.
- [ ] Add visual test: note card text layout does not collapse or show debug metadata.

### 2.2 Note title mismatch inside editor vs outside card

Observed problem: the note name shown inside the editor and the note name shown outside in the note list are not the same.

- [ ] Define a single source of truth for note title: filename, frontmatter title, first heading, or explicit metadata.
- [ ] Decide priority order and document it.
- [ ] Ensure note list, editor top bar, opened note tabs, graph nodes, search results and wiki all use the same title resolver.
- [ ] Update rename flow to update file path and metadata consistently.
- [ ] Update save flow to refresh note list metadata after file write.
- [ ] Add test: rename note, editor title and card title match.
- [ ] Add test: change frontmatter title, editor/card/search titles update consistently.
- [ ] Add test: title fallback from filename is stable when no frontmatter exists.

### 2.3 Invalid Date shown in graph timeline / animation bar

Observed problem: graph timeline displays `Invalid Date`.

- [ ] Audit all date parsing in graph/timeline components.
- [ ] Reject invalid date values before rendering labels.
- [ ] Provide fallback label such as `Unknown date` or hide the timeline entry.
- [ ] Normalize dates from note metadata, filesystem mtime and frontend entries.
- [ ] Add test: graph timeline never renders `Invalid Date`.
- [ ] Add test: notes without dates still render graph nodes.
- [ ] Add test: date sorting stays deterministic when dates are missing.

## 3. Editor content, markdown and tags

### 3.1 Editor does not display note text correctly

Observed problem: opened note has content length in logs, but UI does not display the text correctly.

- [ ] Trace `mt::open-file` -> editor store -> Muya/NoteEditorHost render pipeline.
- [ ] Confirm Tauri file open payload matches Electron payload shape.
- [ ] Confirm markdown content reaches `NoteEditorHost` props/state.
- [ ] Confirm Muya runtime receives current markdown after file open.
- [ ] Add test: open a real markdown file and rendered editor contains the body text.
- [ ] Add test: switching notes replaces editor content.
- [ ] Add test: reopening saved note preserves edited content.

### 3.2 Save/edit/index errors

Observed problem: `searchStore.updateNoteIndex is not a function` during editor update.

- [ ] Add or restore `searchStore.updateNoteIndex(path, markdown)`.
- [ ] Decide whether indexing is synchronous, debounced, or background-only.
- [ ] Ensure editor save path does not crash if search index is disabled.
- [ ] Add test: editing note calls search index update if available.
- [ ] Add test: editing note does not crash if search indexing is unavailable.
- [ ] Add test: save writes markdown and refreshes note preview.

### 3.3 Pin action error

Observed problem: `store.togglePin is not a function` from `NoteEditorHost.vue`.

- [ ] Add compatibility method `togglePin(pathname)` or update `NoteEditorHost` to call `togglePinnedNote` / `togglePinnedEntry`.
- [ ] Ensure note card pin and editor pin use the same store API.
- [ ] Ensure pinned state survives reload via localStorage.
- [ ] Add test: pin from note card works.
- [ ] Add test: pin from editor top bar works.
- [ ] Add test: pinned note sorts before unpinned notes.
- [ ] Add test: pin/unpin never crashes when no vault is active.

### 3.4 Tag submission error

Observed problem: `nextTags.map is not a function` in `updateMarkdownTags()` when submitting tags.

- [ ] Inspect `NoteTagForm.vue` emitted payload shape.
- [ ] Inspect `NoteEditorTopBar.vue` `submitTag` event forwarding.
- [ ] Inspect `NoteEditorHost.vue` `submitTag` handling.
- [ ] Make `updateMarkdownTags()` accept either array of tags or a single tag string safely.
- [ ] Normalize tags through one shared helper.
- [ ] Prevent duplicate tags.
- [ ] Prevent empty tags.
- [ ] Add test: submit one tag string works.
- [ ] Add test: submit array of tags works.
- [ ] Add test: remove tag updates markdown frontmatter.
- [ ] Add test: invalid tag payload does not crash renderer.

### 3.5 Markdown slash features and Excalidraw

Observed problem: Excalidraw does not work, and everything made with `/` in markdown seems broken.

- [ ] Inventory all slash-command features from the Electron baseline.
- [ ] Check quick insert command registry in Tauri renderer.
- [ ] Verify command palette / slash menu opens on `/`.
- [ ] Verify inserting Mermaid works.
- [ ] Verify inserting flowchart works.
- [ ] Verify inserting sequence chart works.
- [ ] Verify inserting Vega/chart block works.
- [ ] Verify inserting Excalidraw block works.
- [ ] Verify persisted markdown syntax reopens correctly.
- [ ] Add test: typing `/` opens quick insert menu.
- [ ] Add test: selecting Excalidraw inserts expected block.
- [ ] Add test: reopening file with Excalidraw block renders it.
- [ ] Add honest status note for features not implemented in Tauri yet.

## 4. Files, folders and vault operations

### 4.1 Move note/folder into folder does nothing

Observed problem: moving a note or folder into a folder has no visible effect.

- [ ] Inspect drag-and-drop event path in sidebar and card grid.
- [ ] Verify frontend calls `vaultStore.moveEntry(entry, targetDirectoryPath)`.
- [ ] Verify backend `elephantnoteClient.entries.move()` is implemented in Tauri.
- [ ] Verify returned entries refresh current folder and root entries.
- [ ] Verify moving a currently open note reopens the correct new path.
- [ ] Add test: move note into folder updates `rootEntries`.
- [ ] Add test: move note out of folder updates `rootEntries`.
- [ ] Add test: move folder into another folder updates all child paths.
- [ ] Add test: reject moving folder into itself.
- [ ] Add test: move operation logs source, target and result count in dev mode.

### 4.2 Create/delete/rename folders

- [ ] Verify create folder works in root.
- [ ] Verify create folder works inside another folder.
- [ ] Verify rename folder updates children, opened note path, pinned paths, graph nodes and search index.
- [ ] Verify delete folder removes children from list/search/graph/sidebar.
- [ ] Verify delete folder prompts confirmation.
- [ ] Add test: create folder then reload vault shows folder.
- [ ] Add test: rename folder then reload vault preserves renamed path.
- [ ] Add test: delete folder then reload vault removes it.
- [ ] Add test: deleting folder containing open note closes or redirects editor safely.

### 4.3 Hidden internal `.elephantnote` files leaking into UI

Observed problem: dashboard/internal note appears open from `.elephantnote/Dashboard.md`, and internal folders may leak.

- [ ] Confirm main notes view excludes `.elephantnote/**`.
- [ ] Confirm wiki view only shows wiki root content, not every hidden folder.
- [ ] Confirm dashboard view can use dashboard data without exposing `.elephantnote/Dashboard.md` as a normal note.
- [ ] Confirm search excludes internal notes unless explicitly requested.
- [ ] Confirm graph excludes internal notes unless explicitly requested.
- [ ] Add test: `.elephantnote/Dashboard.md` does not appear in All notes.
- [ ] Add test: `.elephantnote/embeddings/**` never appears in sidebar/cards/search.
- [ ] Add test: `.elephantnote/wiki/**` appears only in Wiki view.

## 5. Search

Observed problem: search finds literally nothing and may not be implemented.

- [ ] Audit `searchStore` implementation against Electron baseline.
- [ ] Implement or restore note indexing pipeline.
- [ ] Implement `updateNoteIndex(path, markdown)`.
- [ ] Implement full vault indexing on load.
- [ ] Implement incremental index update on save/rename/move/delete.
- [ ] Implement title search.
- [ ] Implement body text search.
- [ ] Implement tag search.
- [ ] Implement folder/path search.
- [ ] Implement empty state and indexing state UI.
- [ ] Add test: creating note with text makes it searchable.
- [ ] Add test: editing note updates search results.
- [ ] Add test: renaming note updates search results.
- [ ] Add test: moving note updates search results path.
- [ ] Add test: deleting note removes it from results.
- [ ] Add honest status note if semantic/vector search is not implemented yet.

## 6. Settings parity

Observed problem: settings render very differently from the Electron baseline.

- [ ] Capture Electron baseline screenshots for every settings page.
- [ ] Capture Tauri screenshots for every settings page.
- [ ] Compare layout, spacing, typography and colors.
- [ ] Fix global theme variables shared by Electron/Tauri.
- [ ] Fix top-level settings shell dimensions.
- [ ] Fix sidebar width, row height and active states.
- [ ] Fix AI settings page rendering.
- [ ] Fix provider settings page rendering.
- [ ] Fix model settings page rendering.
- [ ] Fix vault settings page rendering.
- [ ] Add component tests for settings state changes.
- [ ] Add visual snapshots for each settings page.
- [ ] Add test: settings open without blank page.
- [ ] Add test: toggles persist after reload.

## 7. Top draggable/title area parity

Observed problem: the top app drag area does not match the Electron baseline.

- [ ] Identify Electron titlebar implementation and CSS.
- [ ] Identify Tauri titlebar/window controls implementation.
- [ ] Match height, background, drag region, spacing and button placement.
- [ ] Preserve native macOS traffic-light placement.
- [ ] Ensure draggable area does not block toolbar interactions.
- [ ] Ensure dark/light mode parity.
- [ ] Add visual snapshot for top bar in Electron baseline.
- [ ] Add visual snapshot for top bar in Tauri.
- [ ] Add test: clickable controls inside top area still receive events.

## 8. Chat panel

Observed problems: chat overlays the note instead of resizing it; close button disappears when panel is enlarged too much.

- [ ] Define expected layout: chat should resize available editor area, not overlay note content.
- [ ] Clamp chat sidebar width to safe min/max.
- [ ] Keep close button always visible and sticky in panel header.
- [ ] Ensure editor content width recalculates when chat opens/closes.
- [ ] Ensure graph/wiki/models pages react correctly to chat sidebar.
- [ ] Add test: opening chat changes content layout width.
- [ ] Add test: resizing chat keeps close button visible.
- [ ] Add test: closing chat restores editor width.
- [ ] Add visual snapshot for chat open/closed/resized.

## 9. Models page

Observed problem: model page does not work at all and needs honest implementation status.

### 9.1 Implemented / partially implemented

- [~] Model helper functions exist: model format, quantization, runtime, source, capabilities, download option.
- [~] `ModelsView.vue` has UI skeleton for search/filter/detail/readme/download/roles.
- [~] Tests now import `ModelsView.vue` and check `getDownloadOption` export.

### 9.2 Not proven / likely incomplete

- [ ] Confirm `elephantnoteClient.models.listLocal()` exists and returns expected shape.
- [ ] Confirm `elephantnoteClient.models.searchHuggingFace()` exists and returns expected shape.
- [ ] Confirm model download backend exists in Tauri.
- [ ] Confirm model download progress events exist in Tauri.
- [ ] Confirm cancel download works.
- [ ] Confirm uninstall works.
- [ ] Confirm role assignment persists.
- [ ] Confirm README fetch and markdown render work.
- [ ] Confirm local OCR models are handled separately from GGUF format.
- [ ] Add honest UI state for unimplemented provider/download features.
- [ ] Add test: local model list renders.
- [ ] Add test: remote model search renders.
- [ ] Add test: selecting model opens detail panel.
- [ ] Add test: download button calls backend when backend exists.
- [ ] Add test: unimplemented backend shows explicit unavailable message, not broken UI.

## 10. Graph

Observed problems: graph shows only one note; clicking a note teleports very far; timeline shows `Invalid Date`.

- [ ] Audit graph data source: root entries, opened notes, search semantic graph, wiki proposals.
- [ ] Ensure all visible notes are included in graph model.
- [ ] Ensure folders/tags/links are represented correctly.
- [ ] Ensure click-to-focus centers the selected node instead of teleporting far away.
- [ ] Clamp camera zoom and pan after node click.
- [ ] Normalize missing dates before timeline render.
- [ ] Exclude `.elephantnote/**` internal notes unless graph view explicitly includes internals.
- [ ] Add test: graph model contains all notes from vault entries.
- [ ] Add test: graph click computes bounded camera target.
- [ ] Add test: graph timeline never renders `Invalid Date`.
- [ ] Add visual snapshot: graph with multiple notes.
- [ ] Add visual snapshot: selected graph node.

## 11. Wiki

- [ ] Ensure Wiki view is not just normal explorer with wrong root.
- [ ] Wiki view must read only `.elephantnote/wiki` root.
- [ ] Main explorer must hide `.elephantnote/wiki`.
- [ ] Wiki proposals must load without crashing on `electron-log/renderer`.
- [ ] Add test: wiki route imports and renders.
- [ ] Add test: wiki accepts proposal and opens created wiki note.
- [ ] Add test: dismissed proposal disappears.

## 12. Canvas / Excalidraw

Observed problem: Excalidraw does not work.

- [ ] Confirm Excalidraw dependency loads in Tauri renderer.
- [ ] Confirm React/ReactDOM mounting inside Vue works.
- [ ] Confirm canvas data persists to markdown or vault storage.
- [ ] Confirm reopening a note restores drawing state.
- [ ] Confirm dark/light theme works.
- [ ] Add test: Excalidraw component import does not crash.
- [ ] Add integration test: create drawing, save, reload.
- [ ] Add honest placeholder UI if Excalidraw is not implemented yet.

## 13. Scroll and layout

Observed problem: scroll is horizontal instead of vertical.

- [ ] Identify component causing horizontal overflow.
- [ ] Audit `width: 100vw`, large fixed widths, grid min widths and sidebars.
- [ ] Ensure main notes view uses vertical scroll by default.
- [ ] Ensure horizontal scroll is only used where intentionally needed.
- [ ] Check scroll direction parity Electron vs Tauri.
- [ ] Add DOM test: main content scrollHeight > clientHeight for long lists.
- [ ] Add DOM test: main content scrollWidth <= clientWidth for normal note list.
- [ ] Add visual test: note grid scrolls vertically.

## 14. Logging and diagnostics

Observed problem: not enough is logged to terminal in dev mode.

- [ ] Log renderer boot start/end.
- [ ] Log route navigation.
- [ ] Log vault load result: vault id, entries count, root path.
- [ ] Log note open path, markdown length, source runtime.
- [ ] Log save result and write path.
- [ ] Log search indexing start/end and result count.
- [ ] Log move/rename/delete operations with source, target and updated entries count.
- [ ] Log graph model node/edge count.
- [ ] Log model backend availability.
- [ ] Ensure logs are forwarded from renderer to terminal in Tauri dev.
- [ ] Add test: diagnostics buffer captures renderer errors.
- [ ] Add test: dev terminal forwarding does not throw if Tauri invoke is unavailable.

## 15. Electron/Tauri parity framework

The project needs a real parity harness, not only unit tests.

- [ ] Define a seed vault used by both Electron and Tauri.
- [ ] Seed notes, folders, tags, wiki content, graph links, markdown slash blocks, Excalidraw data and model states.
- [ ] Run the same interaction script against Electron and Tauri.
- [ ] Compare serialized DOM landmarks after each interaction.
- [ ] Compare screenshots for key pages after functional parity is stable.
- [ ] Add per-page visual baselines: Notes, Editor, Settings, Search, Wiki, Graph, Models, Chat open/closed.
- [ ] Fail CI if Electron and Tauri diverge beyond allowed thresholds.
- [ ] Keep manual testing as fallback only, not primary validation.

## 16. Immediate fix order

1. Restore app boot and remove blank page causes.
2. Fix `togglePin` runtime error.
3. Fix tag submission runtime error.
4. Fix search indexing API and search UI.
5. Fix note title/content mismatch.
6. Fix note preview text and frontmatter leakage.
7. Fix move/rename/delete folder workflows.
8. Fix scroll direction and horizontal overflow.
9. Fix graph data/timeline/click behavior.
10. Fix models backend and honest unavailable states.
11. Fix settings and titlebar visual parity.
12. Add real component/integration/visual tests after each fix.

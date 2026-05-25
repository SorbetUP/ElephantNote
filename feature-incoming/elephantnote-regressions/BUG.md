# ElephantNote regressions

- Request: Fix ElephantNote regressions around Excalidraw, settings, tags, pinning, search, Keep import, generated sites, sidebar items, AI/agents, and hard regression tests.
- Level: high
- Date: 2026-05-23
- Slug: elephantnote-regressions

## Summary
- [x] Addressed the highest-risk local failures with focused code changes and regression tests.
- [ ] Full Git sync and full agent transport remain product-level follow-ups beyond this targeted fix.

## Repro Steps
- [x] Open a note and pin it from the editor; pinned state was stored as an absolute path and did not match library relative paths.
- [x] Search a tiny vault; semantic model initialization could be triggered even when exact local search was enough.
- [x] Import a Google Keep ZIP; imported notes needed to be validated and indexed.
- [x] Use YAML block tags; tag parsing only handled simple inline arrays.

## Environment
- [x] Electron/Vite app in `/Users/sorbet/Desktop/Dev/c-editor`.
- [x] Unit tests run with Vitest/jsdom.

## Observed vs Expected
- Observed: pinned icons lacked a filled active state, editor pinning did not line up with card pinning, exact search could stall behind semantic indexing, block tags were ignored, generated site controls were not in settings, and sidebar entries could not be removed in-place.
- Expected: local-first operations should work without model OOM risk, visible state should match persisted state, imports should be covered by real ZIP tests, and settings/sidebar affordances should be directly accessible.

## Hypotheses
- [x] Pinning mismatch came from absolute editor paths versus relative library paths.
- [x] Search freeze/OOM came from loading the local embeddings stack eagerly.
- [x] Tag failures came from overly narrow frontmatter parsing.
- [x] Settings/site accessibility was mainly missing panel affordance and z-index/scroll constraints.

## Investigation Plan
- [x] Inspect ElephantNote stores, editor host, settings, search service, Keep import, and sidebar components.
- [x] Add focused tests around Keep ZIP import, tags, and exact search behavior.

## Fix Plan
- [x] Normalize editor pinning to vault-relative paths and make active pin icons filled yellow.
- [x] Make exact search work from markdown files without loading semantic embeddings.
- [x] Add search timeout handling in renderer state.
- [x] Parse YAML block tags and quoted comma tags.
- [x] Add generated site controls to settings and removable sidebar entries.
- [x] Add a minimal local agents IPC/preload surface.

## Regression Tests
- [x] `test/unit/specs/elephantnote/markdownTags.spec.js`
- [x] `test/unit/specs/elephantnote/googleKeepImport.spec.js`
- [x] `test/unit/specs/elephantnote/search/ElephantSearchService.spec.js`
- [x] Existing ElephantNote search/vector, vault store, and site preview tests.

## Release Notes
- [x] Local exact search is now the default and does not load the semantic model until the semantic index is explicitly rebuilt.
- [x] Google Keep ZIP import is covered by a real archive test.

## Risks
- [ ] Excalidraw still needs rendered Electron QA; build validation passes, but no Browser/Electron interaction run was completed in this pass.
- [ ] Full Git sync and full agent transport need design, persistence, conflict handling, and separate integration tests.

## Rollout
- [x] Ship guarded by existing UI paths and unit coverage.
- [ ] Follow with e2e coverage for rendered editor/settings interactions.

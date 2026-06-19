# ElephantNote security and programming inspection

Date: 2026-06-19
Branch: `nsb/refacto`
Scope: static inspection of the current GitHub branch through repository files. I did not run the application, install dependencies, or execute the test suite in a local checkout.

## Summary

The immediate renderer noise came from the English i18n catalog being bootstrapped as an empty object. The app slowness visible in the logs is consistent with repeated full `search.inspect` calls that serialize the entire semantic graph, including hundreds of thousands of links, through IPC.

Two code fixes were committed before this report:

1. English fallback i18n messages now cover the missing keys seen in the renderer logs and merge with any loaded English locale file.
2. Repeated `search.inspect` calls are now deduplicated and short-cached per window to avoid rebuilding and serializing the same graph payload several times in a few seconds.

## High-priority issues

### 1. Broad preload API exposure

`src/preload/index.js` exposes broad file-system, path, shell, clipboard, webUtils and command-exists helpers to the renderer. If an XSS or renderer-compromise bug exists, those APIs can become a local file read/write/move/delete primitive.

Recommended fix:

- Replace broad `fileUtils`, `path`, `shell`, and `webUtils` exposure with narrow, vault-scoped command APIs.
- Validate every path in the main process, not in the renderer.
- Reject absolute paths and `..` traversal for note operations.
- Keep shell opening behind a strict `https:` / local-file allowlist.

### 2. Large graph payloads through IPC

`inspectIndex()` returns documents, folders, semanticLinks and graph data. With the observed vault, the app logged 1,388 documents and 581,928 semantic links. That is too much data for repeated renderer requests and can freeze the UI.

Recommended fix:

- Keep the committed short-cache, but also split inspection into two APIs:
  - summary endpoint: document count, link count, readiness, top-level graph stats;
  - paginated/detail endpoint: documents, edges, clusters only when the view needs them.
- Cap semantic links at index creation time, not only at graph-render time.
- Add a maximum IPC response size policy for graph/search endpoints.

### 3. Remote AI endpoint and token handling

The AI provider code can send note content to configured endpoints. This is powerful, but it needs explicit safety boundaries because notes may contain private information.

Recommended fix:

- Validate provider URLs: allow only `http://127.0.0.1`, `http://localhost`, and explicit `https:` endpoints.
- Add a clear UI consent gate before sending note content to a remote provider.
- Never log prompts, note content, API keys, Authorization headers, or full endpoint URLs containing credentials.
- Add request timeout and abort handling for all AI network calls.

### 4. Graph/wiki operations can still be expensive

`wiki` generation calls `graph`, and `graph` can depend on `search.inspect`. Even with the short inspect cache, graph and wiki should not synchronously recompute large structures on every UI transition.

Recommended fix:

- Cache graph summaries separately from full graph details.
- Add stale-while-revalidate behavior: immediately return the last graph snapshot, then refresh in the background.
- Add explicit user actions for expensive rebuilds.

## Medium-priority issues

### 5. Locale artifact pipeline is fragile

The renderer expected many i18n keys before any locale file was loaded. The fallback fix prevents warnings for the current English keys, but the build pipeline should still ensure locale artifacts are generated and packaged.

Recommended fix:

- Add a unit test that initializes i18n and checks all keys used by quick insert, image toolbar, front menu, search and editor helpers.
- Add a build check that fails when a locale file is missing required English keys.

### 6. Empty or placeholder tests

Several test files in the branch comparison showed zero-line changes or empty additions. That suggests parts of the new refactor may not yet have useful automated coverage.

Recommended fix:

- Add tests for `search.inspect` caching and invalidation.
- Add tests for i18n fallback loading.
- Add tests for preload API serialization and path boundary validation.

### 7. Element Plus dialog deprecation

The logs show Element Plus warning that the `title` slot for `el-dialog` is deprecated and should be replaced with the `header` slot.

Recommended fix:

- Search all `el-dialog` usages and replace deprecated `#title` / `slot="title"` usage with `#header`.

### 8. Graph complexity controls should be centralized

Search, graph, wiki and semantic-link generation currently have separate limits. This makes it easy for one feature to accidentally return much more data than another feature expects.

Recommended fix:

- Define shared graph limits in one module.
- Enforce limits both at generation time and response-shaping time.
- Expose user-facing performance presets: small, normal, large vault.

## Suggested next commits

1. `security(preload): replace broad renderer APIs with vault-scoped IPC commands`
2. `perf(search): split inspect summary from graph detail payloads`
3. `test(i18n): assert required English fallback keys`
4. `test(search): cover inspect cache dedupe and invalidation`
5. `fix(ui): migrate Element Plus dialog title slots to header slots`

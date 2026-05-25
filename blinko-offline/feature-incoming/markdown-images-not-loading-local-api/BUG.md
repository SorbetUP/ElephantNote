# Bug: Markdown images broken in Tauri local mode (until refresh)

## Observed
- Markdown contains an image like `![]( /api/file/... )`.
- In the desktop app (Tauri) the image renders as a broken-image icon and never recovers.
  - Common triggers: local API base URL not yet known at first render (boot race), or blob-based rendering failing in the WebKit WebView (`WebKitBlobResource error 1`).

## Expected
- Once the local API becomes available (the app emits `local-api:ready`), the image should retry loading and display correctly without requiring a manual refresh.
- Image should load reliably in Tauri without relying on `blob:` URLs.

## Environment
- Tauri desktop app
- Local API base URL may become available after initial app boot (polling `get_local_api_base_url`).
- Protected `/api/file/:id` requires auth; `<img src>` cannot send Authorization headers.

## Repro (best effort)
- [ ] Launch desktop app in a situation where local API base URL is not immediately available.
- [ ] Open a note with Markdown image pointing at `/api/file/...`.
- [ ] Observe the broken image icon.
- [ ] Wait until local API becomes available.
- [ ] Observe image stays broken (before fix).

## Root Cause
- `ImageWrapper` tries to fetch protected `/api/...` images as blobs (to attach Authorization headers).
- In Tauri, when the endpoint is not yet resolved, `getBlinkoEndpoint('/api/...')` can return a raw relative path, which cannot be blob-fetched from the WebView origin.
- The component did not retry after the endpoint later becomes available.
- Additionally, some WebKit WebViews can fail to load `blob:` URLs (`WebKitBlobResource error 1`), leaving the image permanently broken.

## Fix
- [x] Subscribe to `eventBus` events (`local-api:ready`, `user:token`) and retry resolving protected images.
- [x] Avoid attempting blob-fetch when `getBlinkoEndpoint()` is still non-http in Tauri.
- [x] Prefer a direct `.../api/file/:id?token=...` URL when a local token is available (local API explicitly supports `?token=` for this use-case).

## Regression Tests
- [x] Add a unit test ensuring a protected image retries after `local-api:ready` and swaps `src` to an object URL.
- [x] Add a unit test ensuring `blinkoToken` forces `?token=` URL rendering (and skips blob fetch).

## Acceptance Criteria
- [x] In Tauri local mode, notes with `/api/...` Markdown images eventually display without manual refresh.
- [ ] No regressions for normal (non-`/api/`) images.

## Update (2026-02-11)
- [x] Avoid rendering a broken `<img src="/api/...">` before local API base URL is known (renders nothing until `local-api:ready`, then resolves to `?token=` URL or blob URL).

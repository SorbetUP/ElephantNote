# Android: Resources image open shows web error

- Request: Opening an image from Resources on Android opens http://127.0.0.1.../api/file/:id without token and fails (ERR_HTTP_RESPONSE_CODE_FAILURE).
- Level: P1
- Date: 2026-02-20
- Slug: android-resources-open-image-401

## Summary
- [x] Android: tapping an image in Resources opened a WebView tab without auth token → local API returned 401 → `ERR_HTTP_RESPONSE_CODE_FAILURE`.
- [x] Fix: open images via in-app PhotoView using a tokenized URL (no `window.open` for images).

## Repro Steps
- [ ] Android (Tauri), local-first (API at `http://127.0.0.1:<port>`).
- [ ] Go to **Resources**.
- [ ] Tap an image row → previously opened `http://127.0.0.1:<port>/api/file/:id` without token and failed.

## Environment
- [ ] Android device, Tauri mobile build (debug arm64).
- [ ] Local API requires auth for `/api/file/:id` unless shared-note flow.

## Observed vs Expected
- Observed:
- Page Web non disponible / `net::ERR_HTTP_RESPONSE_CODE_FAILURE` when opening image.
- Expected:
- Image preview opens inside the app (or opens externally after download), no WebView auth errors.

## Hypotheses
- [x] Resources row used `window.open(getBlinkoEndpoint(item.path))` and did not append `?token=...`.
- [x] Local API `download_file` enforces token via header/query.

## Investigation Plan
- [x] Trace click handler in `ResourceItem.tsx`.
- [x] Confirm local API auth checks in Rust handler for `/api/file/:id`.

## Fix Plan
- [x] Frontend: `ResourceItem` wraps image rows in `PhotoView` with tokenized URL.
- [x] Remove per-item `PhotoProvider` (page-level provider already exists).
- [x] Disable Resources drag&drop on mobile (avoid touch conflicts and perf issues).

## Regression Tests
- [x] Vitest: `ResourceItem.mobileOpen.test.tsx` asserts PhotoView `src` includes `token=` and `window.open` is not used for images.

## Release Notes
- [x] Android: Resources image preview no longer opens a failing WebView page; images open in-app with auth.

## Risks
- [ ] Token in query string may appear in some logs; acceptable for sideload/dev builds.

## Rollout
- [x] Included in next Android debug arm64 APK build.

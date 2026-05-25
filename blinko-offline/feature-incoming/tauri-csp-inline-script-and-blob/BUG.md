# Bug: Tauri/WebKit CSP blocks inline script + blob resources (console spam, broken UI)

## Summary
- **Observed:** In the Tauri desktop WebView (WebKit), console shows repeated CSP violations like “Refused to execute a script because its hash, its nonce, or 'unsafe-inline'…”, plus `WebKitBlobResource error 1` failures on `blob:tauri://localhost/...`. Login requests can also show `409 (Conflict)` on `/api/auth/login` when no local account exists.
- **Expected:** No CSP violations for bundled app assets; blob resources (workers/object URLs) load correctly; auth flow shows a clear first-run signup path.
- **Status:** Report created manually because `scripts/create_bug_folder.py` / `assets/BUG_TEMPLATE.md` were not found in this repo.

## Environment (known)
- Desktop wrapper: Tauri v2 (`app/src-tauri/Cargo.toml`)
- CSP configured in `app/src-tauri/tauri.conf.json`
- Frontend entry: `app/index.html` + Vite build output in `dist/public`

## Repro Steps
- [ ] Build and run the desktop app (`bun run build:bundle`).
- [ ] Open devtools console.
- [ ] Observe CSP violations for inline scripts and failures to load `blob:tauri://localhost/...` resources.

## Expected Behavior
- [ ] No CSP violations for app-provided scripts/styles.
- [ ] Blob resources (e.g. object URLs, workers) load without `WebKitBlobResource` errors.

## Actual Behavior
- [ ] Inline script execution blocked by CSP.
- [ ] Some blob URL fetches fail with `WebKitBlobResource error 1`.

## Root Cause (most likely)
- [ ] `app/index.html` contained an inline `<script>` that set `window.EXCALIDRAW_ASSET_PATH`. In Tauri v2, the effective CSP can reject inline scripts unless they have an allowed hash/nonce.
- [ ] The CSP did not explicitly allow blob-based script/worker loading in WebKit (`blob:` for `script-src` and legacy `child-src`/modern `worker-src`), leading to `blob:tauri://...` failures.

## Fix Plan (Implemented)
- [x] Remove inline script from `app/index.html`
  - [x] Rely on `app/src/components/Common/Excalidraw/ExcalidrawEditorDialog.tsx` lazy loader to set `window.EXCALIDRAW_ASSET_PATH` before dynamic import.
- [x] Allow blob-based resources in Tauri CSP
  - [x] Add `child-src 'self' blob:; worker-src 'self' blob:;` and allow `blob:` in `script-src` in `app/src-tauri/tauri.conf.json`.
- [x] Update regression test for Excalidraw asset-path behavior
  - [x] Adjust `app/tests/excalidraw_integration.test.mjs` to assert the runtime loader sets the asset base, and that `app/index.html` has no inline `EXCALIDRAW_ASSET_PATH` script.

## Validation
- [x] `bun run test:api-local`
- [x] `cd app && bun run test:excalidraw`
- [x] `cd app && bun run test`
- [x] `cd app && bun run build:no-pwa`
- [x] `bun run build:bundle` (produces `.app` and `.dmg`)

## Notes / Follow-ups
- [ ] `/api/auth/login` returning `409 (Conflict)` is expected when no local account exists (local mode signup happens via `users.register` tRPC). If this is confusing in UI, we should handle `409` by guiding the user to the local signup flow instead of showing a generic “failed request” state.


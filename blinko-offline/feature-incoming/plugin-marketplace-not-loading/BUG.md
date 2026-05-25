# Bug Report: Marketplace Plugins Not Loading (Local Mode)

## Summary
- **Observed:** In the Plugins settings tab "Place de marche" (Marketplace), no public plugins are shown.
- **Expected:** The marketplace list is populated from the official plugin marketplace index.

## Environment
- Desktop app (Tauri) in local mode (Local API server).
- UI shows empty state "Pas de donnees ici".

## Reproduction Steps
- [ ] Run the desktop app in local mode.
- [ ] Open Settings -> Plugins -> "Place de marche".
- [ ] Observe the marketplace list.

## Actual Result
- [ ] Marketplace list is empty.

## Expected Result
- [ ] Marketplace list contains entries from the plugin marketplace index.

## Root Cause
- [x] Local API tRPC handler stubbed `plugin.getAllPlugins` to always return `[]`.

## Fix
- [x] Implemented local-mode `plugin.getAllPlugins` to fetch and return the marketplace `index.json`.
- [x] Made backend (Bun) `plugin.getAllPlugins` public and resilient to proxy/network failures by returning `[]` on error.

## Files Changed
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri/src/local_api/handlers_trpc.rs`
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri/src/local_api/mod.rs`
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri/src/local_api/tests.rs`
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri/src/bin/local_api_server.rs`
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri/src/lib.rs`
- [x] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/server/routerTrpc/plugin.ts`

## Regression Tests
- [x] Rust: local API test asserts `/api/trpc/plugin.getAllPlugins` returns a non-empty array (via a mocked marketplace server).
- [x] `cargo test` in `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src-tauri`.

## Notes
- Template/script referenced by the Codex bug skill was not found in this repo; report created manually.

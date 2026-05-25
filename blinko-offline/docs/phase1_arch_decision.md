# Phase 1.1 — Architecture decision (local API vs invoke)

## Decision
**Option A: local HTTP API in Rust (Axum), keeping the UI’s HTTP model.**

## Rationale
- The UI already calls HTTP endpoints (`/api/trpc`, `/api/*`, `/api/auth/*`, `/api/file/*`), so an embedded HTTP API minimizes UI refactors. `app/src/lib/trpc.ts:20-66`, `app/src/components/Auth/auth-client.ts:64-212`
- Tauri already ships with the HTTP plugin and a global Tauri context, which keeps mobile parity while avoiding a Node sidecar. `app/src-tauri/src/lib.rs:9-17`
- We can keep the existing login flow by mirroring minimal `/api/auth/*` routes in the local API, reducing UI changes.

## Impact
### UI
- Minimal changes: baseURL resolution should point to local API when `blinkoEndpoint` is unset. `app/src/lib/blinkoEndpoint.ts:2-20`
- Optional: hide the endpoint prompt on Tauri login when local API is available. `app/src/pages/signin.tsx:164-176`

### Backend (Rust)
- Add Axum server with a subset of endpoints (notes/settings/files/auth/health).
- Add a small runtime manager to start/stop the local API and expose its base URL via a Tauri command.

## Decision summary
- **Chosen:** Local HTTP API in Rust
- **Not chosen:** Tauri invoke-only commands (too much UI surface to refactor)

# ARCHITECTURE_LOCAL_MODE

## Current state (from code)
- Embedded local API (Axum) runs in-process and binds `127.0.0.1:0`, with base URL exposed via `get_local_api_base_url()`. `app/src-tauri/src/local_api/mod.rs:73-79`, `app/src-tauri/src/lib.rs:70-109`
- Local runtime sets up `local_config.json`, device_id, and local API token in app data, and creates app-data paths for SQLite + attachments. `app/src-tauri/src/local_runtime/config.rs:30-83`, `app/src-tauri/src/local_runtime/paths.rs:18-60`
- UI resolves baseURL at startup via `resolveBaseUrl()` and caches it in localStorage; tRPC client targets `/api/trpc` and falls back to Tauri commands if local HTTP is unavailable. `app/src/lib/blinkoEndpoint.ts:52-76`, `app/src/lib/trpc.ts:67-89`
- Local API provides REST endpoints (`/api/notes`, `/api/settings`, `/api/file`, `/sync/*`) and a tRPC-compat layer at `/api/trpc`; local auth token required except `/health`. `app/src-tauri/src/local_api/router.rs:28-67`, `app/src-tauri/src/local_api/handlers_auth.rs:27-52`
- SQLite is the local source of truth; attachments live under app data `attachments/`. `app/src-tauri/src/local_runtime/paths.rs:31-45`, `app/src-tauri/migrations/0001_init.sql:1-94`
- Sync scheduler runs on startup and every 5 minutes; uses outbox + `/changes` pull/push, LWW conflict logging, and attachment upload/download. `app/src-tauri/src/sync/scheduler.rs:12-106`, `app/src-tauri/src/sync/mod.rs:54-118`
- Remote server remains Node/Express on port 1111; remote-only is still supported via `blinkoEndpoint`. `server/index.ts:91-146`, `app/src/lib/blinkoEndpoint.ts:9-25`

## Offline behavior (implemented)
- App boot does not require an external server when local mode is active.
- Reads/writes go to local SQLite DB; sync is best-effort and non-blocking.

## Open decisions
- Remote `/changes` endpoint contract and auth strategy (server-side support is not verified).
- Attachment sync: remote `/api/file/{id}` expects which ID (sync_id vs numeric)?
- Tags/metadata persistence for local mode (currently stubbed in tRPC responses).

# Phase 0 Inventory

## Repo layout (top level)
- app/ : React + Vite frontend and Tauri wrapper (includes app/src-tauri and app/tauri-plugin-blinko).
- server/ : Node + Express backend with tRPC + OpenAPI.
- shared/ : shared helpers, types, constants.
- prisma/ : Prisma schema + migrations (Postgres).
- dist/ : built frontend output (served by server).

## Server framework and entrypoints
- Express app with tRPC + OpenAPI adapters and Swagger docs. `server/index.ts:1-218`
- Port is fixed at 1111 for the server. `server/index.ts:91-94`
- Health check at /health. `server/index.ts:221-223`
- API routers mounted for auth, file, rss, openai, mcp. `server/index.ts:132-191,227`

## UI API layer and base URL
- UI uses tRPC client with links pointing to getBlinkoEndpoint('/api/trpc'). `app/src/lib/trpc.ts:71-125`
- Base URL is resolved via resolveBaseUrl(): cached endpoint → localStorage → Tauri `get_local_api_base_url()` → window.location.origin. `app/src/lib/blinkoEndpoint.ts:52-76`
- Tauri login screen exposes an endpoint input and persists blinkoEndpoint (remote mode). `app/src/pages/signin.tsx:164-176`

## Notes for local-first work
- Local runtime uses SQLite in app data + local_config.json. `app/src-tauri/src/local_runtime/paths.rs:18-60`, `app/src-tauri/src/local_runtime/config.rs:30-83`
- Local API runs in-process (Axum), binds 127.0.0.1:0, exposes base URL via Tauri command. `app/src-tauri/src/local_api/mod.rs:73-79`, `app/src-tauri/src/lib.rs:70-109`
- Mobile entrypoint registers local API commands and fallback note commands. `app/src-tauri/src/lib.rs:120-170`

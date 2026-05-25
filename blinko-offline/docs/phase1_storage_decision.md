# Phase 1.2 — Storage decision

## Decision
- **DB:** SQLite
- **Driver:** `sqlx` (SQLite) with async runtime (Tokio)
- **Attachments:** `app_data_dir/blinko/attachments/*`

## Rationale
- SQLite fits local-first, offline-first storage and is portable across desktop + mobile.
- `sqlx` keeps a clean async API that pairs well with an HTTP server (Axum).
- App-data is the correct cross-platform storage location; `process.cwd()` is not reliable on mobile.

## Paths (target)
- `app_data_dir/blinko/` (root)
- `app_data_dir/blinko/blinko.sqlite` (DB)
- `app_data_dir/blinko/attachments/` (files)
- `app_data_dir/blinko/local_config.json` (local config)

## Evidence from current code
- Current server uses Postgres via Prisma (not local). `prisma/schema.prisma:10-12`
- Current file paths are rooted at `process.cwd()` (not app-data). `shared/lib/pathConstant.ts:3-9`

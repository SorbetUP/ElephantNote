# Phase 0 Storage Map

## Primary databases
- Remote server uses Postgres via Prisma (DATABASE_URL). `prisma/schema.prisma:10-12`
- Local runtime uses SQLite in app data (migrations define notes, tags, attachments, outbox, conflicts, sync_state). `app/src-tauri/migrations/0001_init.sql:1-94`

## Local app-data paths
- Local data root: `app_data_dir/blinko`. `app/src-tauri/src/local_runtime/paths.rs:18-35`
- SQLite DB: `blinko.sqlite`, config: `local_config.json`, attachments: `attachments/`. `app/src-tauri/src/local_runtime/paths.rs:31-45`

## File storage (attachments)
- Server-side local file storage path root is .blinko/files under process.cwd(). `shared/lib/pathConstant.ts:3-9`
- FileService writes locally by default, or uses S3 when objectStorage == 's3'. `server/lib/files.ts:79-131`
- Local file paths are exposed as /api/file/<path>, S3 as /api/s3file/<key>. `server/lib/files.ts:108-131`
- Remote sync metadata can store `syncId` on attachments (column added). `prisma/schema.prisma:27-52`
- Local runtime stores attachments under app data `attachments/` and exposes them via local API `/api/file/:id`. `app/src-tauri/src/local_api/router.rs:51-56`, `app/src-tauri/src/local_runtime/paths.rs:31-45`

## Other server-side paths
- Backup + temp + vector paths are rooted under .blinko or backup. `shared/lib/pathConstant.ts:5-10`

## Client-side storage (browser/Tauri)
- StorageState reads/writes window.localStorage. `app/src/store/standard/StorageState.ts:23-44`
- Tauri base URL is persisted in localStorage key blinkoEndpoint. `app/src/lib/blinkoEndpoint.ts:4-36`
- Sign-in persists username/password in StorageState keys. `app/src/pages/signin.tsx:89-103`

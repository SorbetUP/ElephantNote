# Bug: Sync Mode Remote UI Missing Notes

- **Status:** Fixed locally with regression tests; deployed and verified on Proxmox LXC `192.168.0.118:1111`.
- **Severity:** P1 (core feature broken: sync appears to succeed but user sees no notes in remote UI)

## Report

- **Observed:** After syncing from the PC, browsing the remote web UI at `http://192.168.0.118:1111/` does not show notes created on the PC.
- **Expected:** Notes created/updated on the PC should appear in the remote web UI after sync completes.

## Root Cause

- The remote `/changes` endpoint persisted incoming sync operations into `sync_changes`, but did **not** apply (“materialize”) note ops into the server’s `notes` table.
- The web UI reads from `notes`, so sync ops existed but nothing appeared in the UI.

Additional issue found during investigation:
- The sync protocol echoed a device’s own ops back to it (no `device_id` exclusion on pull), which could create unnecessary conflicts locally.

## Fix

- [x] Add server-side note sync fields (`notes.syncId`, `syncUpdatedAt`, `syncDeviceId`, `syncRev`, `syncDeletedAt`, ...) so server can map local `sync_id` to server notes and apply LWW safely.
- [x] Materialize inbound note ops in `/changes` into `notes` (and tag relations derived from hashtags), so UI sees synced notes.
- [x] Seed initial sync snapshot on first pull when `sync_changes` is empty, so remote -> local sync can bootstrap.
- [x] Emit `sync_changes` rows when notes are created/updated via the web API (`/api/v1/note/upsert`), so remote UI edits can replicate back to the PC.
- [x] Exclude a client’s own `device_id` from `/changes` pull results to prevent echo/conflict churn.

## Verification

### Local

- [x] `bun run test:api-local`
- [x] `node tools/local_api_smoke.mjs`
- [x] `node tools/sync_e2e_docker.mjs` (now asserts note appears in `/api/v1/note/list` after sync push)

### Proxmox LXC

- [x] Deploy server changes + migration
- [x] `node tools/sync_e2e_remote.mjs` against `http://192.168.0.118:1111` (asserts note op arrives in `/changes` and note appears in `/api/v1/note/list`)

## Files Changed

- Server sync materialization and snapshot seeding:
  - `server/routerExpress/changes.ts`
  - `server/lib/sync_notes.ts`
- Server note mutations now emit sync ops:
  - `server/routerTrpc/note.ts`
- Prisma schema + migration:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260208193000_add_note_sync_fields/migration.sql`
- Client echo avoidance on pull:
  - `app/src-tauri/src/sync/remote_client.rs`
  - `app/src-tauri/src/sync/scheduler.rs`
  - `app/src-tauri/src/sync/migration.rs`


## Notes / Operational Detail

- Existing local notes created before sync was enabled are not necessarily in the sync outbox. They will not appear on the remote unless you either:
  1. run the UI action `Sync -> Export` (local -> remote), or
  2. perform an equivalent bulk export (I ran one directly against the real desktop DB on this machine, which pushed 2109 notes into the Proxmox server).

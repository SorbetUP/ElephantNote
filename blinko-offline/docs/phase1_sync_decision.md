# Phase 1.3 — Sync decision (MVP)

## Decision
- **Model:** Oplog + incremental pull/push
- **Conflict strategy:** Last-write-wins (updated_at + device_id tie-break)
- **Scope (MVP):** notes + settings (attachments optional in v1)

## Rationale
- Oplog is simple, debuggable, and supports incremental sync with a cursor.
- LWW is acceptable for MVP and avoids complex merge logic.
- Attachments can be layered on after note + settings correctness.

## Minimal protocol (MVP)
- **Pull:** `GET /changes?since=<cursor>` → apply upserts + tombstones
- **Push:** `POST /changes` with batch of oplog events
- **Cursor:** `oplog.id` or monotonically increasing timestamp

## Storage impact
- Local `oplog` table + `sync_state` table (per remote endpoint)

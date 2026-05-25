# Sync protocol (MVP)

## Entities
- notes
- settings
- attachments (phase 2)

## Identifiers
- `sync_id`: UUID v4 for entities (stable across devices)
- `device_id`: UUID v4 generated on first run

## Local change tracking
- Oplog (history)
- Outbox (pending push)

```
{
  "id": 123,
  "entity_type": "note",
  "entity_id": "<sync_id>",
  "op": "create|update|delete|upsert",
  "payload_json": "{...}",
  "ts": "2024-01-01T00:00:00Z",
  "device_id": "<device_id>",
  "status": "pending|sent"
}
```

## Remote API (MVP)
- Pull: `GET /changes?since=<cursor>`
  - Response: `{ "cursor": "<cursor>", "ops": [ ... ] }`
- Push: `POST /changes`
  - Body: `{ "ops": [ ... ] }`
- Auth: `Authorization: Bearer <token>`

## Attachments (phase 2)
- Upload: `POST /api/file/upload` (multipart)
  - Field: `file` (binary)
  - Field: `sync_id` (UUID v4)
- Download: `GET /api/file/by-sync-id/<sync_id>`

## Conflict strategy
- Last-write-wins based on `updated_at`
- Tie-breaker on `device_id` (lexicographical compare when timestamps are equal)
- Conflicts are logged to `conflicts` with local/remote payloads

## Cursor
- `last_pull_cursor`: cursor returned by remote `GET /changes`
- `last_push_cursor`: last outbox id successfully pushed

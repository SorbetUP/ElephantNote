# API Contract (Local-first MVP)

## HTTP (local API)

### Health
- `GET /health`
  - Response: `{ "ok": true, "version": "local" }`

### Auth
- `POST /api/auth/login`
  - Request: `{ "username": string, "password": string }`
  - Response: `{ "user": { id, name, role, nickname, image }, "token": string }`
- `POST /api/auth/local` (alias)
- `GET /api/auth/profile`
  - Requires `Authorization: Bearer <local_token>`
  - Response: `{ "user": { ... } }`

### Notes
- `GET /api/notes`
  - Response: `{ "data": Note[] }`
- `GET /api/notes/:id`
  - Response: `Note`
- `POST /api/notes`
  - Request: `{ title?, content?, isArchived?, isRecycle?, isShare?, isTop?, type? }`
  - Response: `Note`
- `PUT /api/notes/:id`
  - Request: `{ title?, content?, isArchived?, isRecycle?, isShare?, isTop?, type? }`
  - Response: `Note`
- `DELETE /api/notes/:id`
  - Response: `Note`

### Settings
- `GET /api/settings`
  - Response: `Setting[]`
- `PUT /api/settings`
  - Request: `{ key, value }`
  - Response: `Setting`

### Files / Attachments
- `POST /api/file/upload` (multipart)
  - Field: `file`
  - Response: `{ filePath, fileName, type, size }`
- `POST /api/file/upload-by-url`
  - Request: `{ url }`
- `GET /api/file/:id`
  - Response: file stream
- `DELETE /api/file/:id`

Aliases:
- `POST /attachments`
- `GET /attachments/:id`
- `DELETE /attachments/:id`

### Sync
- `GET /sync/settings`
- `PUT /sync/settings`
- `POST /sync/now`
- `GET /sync/conflicts?limit=&offset=`
- `GET /sync/conflicts/:id`
- `POST /sync/conflicts/:id/resolve`

#### `GET /sync/settings`
- Response:
  - `mode: "local" | "remote" | "sync"` *(dérivé; l’UI ne pilote plus ce champ)*
  - `remote_endpoints: Array<{ id: string; url: string; token?: string | null; last_sync_at?: string | null }>`
  - `allow_insecure_http: boolean`
  - `sync_auto: boolean`
  - `sync_interval_secs: number`

#### `PUT /sync/settings`
- Request (tous champs optionnels):
  - `remote_endpoints?: Array<{ id: string; url: string; token?: string | null }>`
  - `allow_insecure_http?: boolean`
  - `sync_auto?: boolean`
  - `sync_interval_secs?: number`
  - `mode?: "local" | "remote" | "sync"` *(deprecated; ignoré/écrasé par le calcul implicite)*
- Response: même payload que `GET /sync/settings`

### tRPC (local compatibility)
- `POST/GET /api/trpc/<procedure>`
  - Supports `notes.*`, `config.*`, `attachments.*`, `tags.*` and safe fallbacks

## Tauri command fallback (no local HTTP)
- `notes_list(input?) -> Note[]`
- `note_get(id) -> Note | null`
- `note_upsert(input) -> Note`
- `note_delete(id) -> { ok: true }`

# Bug Report: Global Search Missing Notes

## Summary
- **Observed:** Global search (Ctrl+K) returns resources/settings but no notes even when note content matches the query (e.g., “Cours”).
- **Expected:** Notes with matching title/content appear in the Notes section.

## Environment
- Desktop app (Tauri) and/or server-backed mode.
- Query example: `co`, `Cours`.
- Locale: `fr` (based on UI screenshot).

## Reproduction Steps
- [ ] Open the global search modal (Ctrl+K).
- [ ] Type a query that exists in a note title/content (e.g., `Cours`).
- [ ] Observe results.

## Actual Result
- [ ] Notes section is empty.
- [ ] Resources and settings may appear, confirming the modal is working.

## Expected Result
- [ ] Notes matching the query appear in the Notes section.

## Hypotheses
- [ ] Notes search only matches `content` but user-visible titles are stored in `title`, so matches are missed.
- [ ] Local/Tauri search does not filter by `searchText` and/or `title`.
- [ ] API call to `notes.list` returns empty results due to query constraints.

## Fix Plan
- [x] Add `title` to search OR in `server/routerTrpc/note.ts` when `searchText` is provided.
- [x] Add `searchText` + `type` filtering in Tauri `notes_list` local command.
- [x] Fix local Tauri tRPC `notes.list` to treat `type=-1` as "all" and filter by `searchText`.
- [x] Test live local endpoints to confirm `type=-1` currently returns empty.
- [ ] Rebuild/relaunch the app and re-test `notes.list` with `type=-1` + `searchText`.

## Regression Tests
- [ ] Manual: Create a note titled “Cours ML 2” and search `Cours` → note appears in results.
- [ ] Manual: Search partial text from body → note appears.
- [ ] Manual: Search with mixed case (e.g., `cOu`) → note appears.
- [ ] Endpoint: `notes.list` with `searchText=Cours` returns at least one note containing “Cours”.

## Notes
- Template/script not found in repo; report created manually.
- Local API test results (2026-02-05): `notes.list` returns data when `type` is omitted or `0`, but returns empty when `type=-1` (the value used by global search).

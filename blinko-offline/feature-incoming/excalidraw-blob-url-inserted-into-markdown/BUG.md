# Bug: Excalidraw image inserted as `blob:tauri://...` URL in markdown (breaks after reload)

## Summary
- **Observed:** After creating/editing an Excalidraw drawing and inserting it into the note content, the markdown can contain a link/image URL like `blob:tauri://localhost/...`. On reload / on another device, this URL is no longer valid and the image renders as broken.
- **Expected:** Inserted markdown should reference the persisted attachment path (typically `/api/...`) so it remains stable across sessions and sync.
- **Status:** Report created manually because `scripts/create_bug_folder.py` and `assets/BUG_TEMPLATE.md` were not found in this repo.

## Environment (known)
- Tauri desktop (screenshot shows `blob:tauri://localhost/...` object URLs)
- Editor: Vditor-based markdown editor
- Feature area: attachments toolbar and attachment insertion into editor

## Repro Steps
- [ ] Open the editor (create note or edit note).
- [ ] Create a drawing via the Excalidraw button (or edit an image with Excalidraw).
- [ ] In the attachment strip, use "Insert context" on the newly created image.
- [ ] Observe inserted markdown references a `blob:tauri://...` URL (or image renders broken).
- [ ] Reload the app / reopen the note.
- [ ] Observe the image fails to render because the `blob:` URL is not stable.

## Expected Behavior
- [ ] "Insert context" inserts markdown using the uploaded attachment path (ex: `/api/file/...`), not `blob:` URLs.
- [ ] After reload, the image renders correctly.

## Actual Behavior
- [ ] "Insert context" used `file.preview` (a `URL.createObjectURL(...)` result) which becomes `blob:tauri://...` in Tauri.
- [ ] The `blob:` URL breaks across reloads / sessions.

## Root Cause
- [ ] `EditorStore.uploadFiles()` sets `file.preview = URL.createObjectURL(file)` for immediate UI preview.
- [ ] `InsertConextButton` inserted markdown using `file.preview` instead of the persisted upload result (`file.uploadPromise.value`).

## Fix Plan (Implemented)
- [x] Update insert behavior to prefer the uploaded path
  - [x] In `app/src/components/Common/AttachmentRender/icons.tsx`, use `file.uploadPromise.value` (fallback `file.preview`) when emitting `editor:insert`.
  - [x] Guard: if only a `blob:`/`data:` preview exists (no persisted upload path), do not insert anything.
- [x] Add regression tests
  - [x] Add a Vitest test that ensures "Insert context" emits markdown with `/api/...` and never `blob:`.
  - [x] Add a Vitest test that ensures no markdown is inserted when only a `blob:` preview exists.
  - [x] Add a Vitest test for the Excalidraw toolbar button to ensure `onSave` routes through `onFileUpload` (sanity coverage of the interaction path).
- [x] Prevent getting stranded on a broken viewer page when clicking a `blob:` link in markdown
  - [x] In `app/src/components/Common/MarkdownRender/LinkPreview.tsx`, render `blob:` links as non-clickable text (no `window.open`).
  - [x] Add a Vitest test that asserts `blob:` links are not opened.
- [x] Auto-repair existing `blob:` links in the editor once uploads/attachments are available
  - [x] Add `sanitizeBlobLinksWithAttachments()` helper and unit tests.
  - [x] Call auto-fix after uploads complete, when editor loads `originFiles`, and after vditor initializes (so the first render cannot miss the repair).

## Validation
- [x] `bun x vitest run src/components/Common/AttachmentRender/__tests__/InsertContextButton.usesUploadedPath.test.tsx`
- [x] `bun x vitest run src/components/Common/Editor/Toolbar/ExcalidrawButton/index.test.tsx`

## Acceptance Criteria
- [x] In Tauri, inserting an Excalidraw image into markdown never yields `blob:tauri://...` URLs.
- [x] Regression tests fail if `blob:` gets reintroduced into inserted markdown.

# Android: Excalidraw edit shows blank canvas

- Request: Editing an image with Excalidraw removes it from note and opens blank canvas.
- Level: P1
- Date: 2026-02-20
- Slug: android-excalidraw-edit-image-blank-canvas

## Summary
- [x] Android: “Edit with Excalidraw” opened a blank canvas and could make the attachment appear removed/changed.
- [x] Fix: detect empty `loadFromBlob` result and fall back to inserting the image; normalize `/api/file/:id` for overwrite-in-place.

## Repro Steps
- [ ] Android (Tauri).
- [ ] Open a note with an image attachment.
- [ ] Tap “Edit with Excalidraw”.
- [ ] Previously: Excalidraw opens blank; saving could upload a new attachment instead of overwriting.

## Environment
- [ ] Android device, Tauri mobile build.
- [ ] Image attachments served via `/api/file/:id` (local or remote).

## Observed vs Expected
- Observed:
- Blank Excalidraw canvas; image sometimes “disappears” from note due to attachment path changes.
- Expected:
- Excalidraw opens with the image pre-inserted; Save overwrites existing attachment (same `/api/file/:id`).

## Hypotheses
- [x] `loadFromBlob(blob)` can resolve successfully but return an empty scene for non-Excalidraw PNGs.
- [x] Overwrite path detection required `src.startsWith('/api/')`; on mobile we often have absolute/tokenized URLs.

## Investigation Plan
- [x] Inspect `ExcalidrawEditorDialog.tsx` init logic (loadFromBlob/fallback).
- [x] Inspect `imageRender.tsx` overwrite path detection.

## Fix Plan
- [x] Excalidraw init: if `loadFromBlob` returns an empty scene (no elements, no files), fall back to `createSceneFromImageBlob`.
- [x] Attachment overwrite: normalize absolute/tokenized URLs back to `/api/file/:id` before calling overwrite/delete/replace.
- [x] Add i18n key `unsupported-image-format` for user-facing error on decode failures.

## Regression Tests
- [x] Vitest: `ExcalidrawEditorDialog.emptySceneFallback.test.tsx` ensures empty-scene `loadFromBlob` triggers image-scene fallback.
- [x] Vitest: overwrite-path normalization covered indirectly by UI behavior; add direct unit if this regresses again.

## Release Notes
- [x] Android: Excalidraw editor now opens images reliably and overwrites attachments in place.

## Risks
- [ ] If a user intentionally saved a “blank Excalidraw PNG”, we now prefer image insertion for empty scenes; acceptable for mobile UX.

## Rollout
- [x] Included in next Android debug arm64 APK build.

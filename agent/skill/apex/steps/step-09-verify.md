# APEX Step 09 — Verify

Prove the feature works at the surface where the user experiences it.

## Procedure

1. Launch the smallest relevant runtime: unit runner, Electron dev app, Tauri dev app, Android/mobile flow, or Docker pair.
2. Exercise the real user action or command path.
3. Inspect logs when the feature involves async loading, IPC, filesystem, sync, local AI, or background jobs.
4. Confirm the result persists across reload when persistence is part of the feature.
5. Capture exact commands and observed evidence.

## ElephantNote examples

- Editor/assets: insert image or Excalidraw, save, reload, verify Markdown points to `.assets` and preview renders.
- Vault tree: create, rename, move, delete folder; verify disk and UI agree.
- Tauri: build or dev launch opens the window and exposes required commands.
- Sync: mutate vault A, sync, verify vault B receives the real file and conflict behavior is explicit.
- Search/wiki/graph: create notes, index, query, verify exact and semantic paths return real notes.

## Rules

- Do not claim browser/app verification when only unit tests ran.
- Report skipped verification and the concrete reason.

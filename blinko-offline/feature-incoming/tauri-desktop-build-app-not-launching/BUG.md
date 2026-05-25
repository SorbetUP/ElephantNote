# Bug: Desktop build produces app that does not launch

## Summary
- **Observed:** After running `bun run tauri:desktop:build`, the produced desktop app does not launch (no visible window).
- **Expected:** The built app launches and shows the main window (or at least opens in the tray with a visible main window when toggled).
- **Status:** Report created manually because `scripts/create_bug_folder.py` and `assets/BUG_TEMPLATE.md` were not found in this repo.

## Environment (to capture)
- [ ] OS + version:
- [ ] CPU arch (x64/arm64):
- [ ] Build machine (local/CI) + shell:
- [ ] Rust toolchain (`rustc -V`) + cargo (`cargo -V`):
- [ ] Node/Bun versions (`node -v`, `bun -v`):
- [ ] Tauri CLI (`app/node_modules/.bin/tauri -V` or `bun run tauri -V`):

## Repro Steps
- [ ] From repo root: `bun run build:bundle` (which runs `cd app && bun run tauri:desktop:build`).
- [ ] Or from `app/`: `bun run tauri:desktop:build`.
- [ ] Locate the built bundle (platform-specific path; see Notes).
- [ ] Launch the app via Finder/Explorer.
- [ ] Observe: app does not show any window and appears not to start.

## Expected Behavior
- [ ] App launches and shows the main window.
- [ ] If the app is configured to start hidden, it should be visible in the tray and the window should be showable from the tray or shortcut.

## Actual Behavior
- [ ] App process does not stay running / window never appears / tray icon absent (confirm exact symptom).

## Notes From Repo Scan
- Build script: `app/package.json` defines `tauri:desktop:build` -> `tauri build`.
- Tauri config: `app/src-tauri/tauri.conf.json`.
  - `frontendDist` is `../../dist/public` (relative to `app/src-tauri`).
  - Main window in config has `visible: false`.
- `app/src-tauri/src/lib.rs` calls `setup_app(app)?;` during setup.
- `app/src-tauri/src/desktop/setup.rs` calls `restore_main_window_state`, which should call `window.show()`.
- `setup_app` does `app.get_webview_window("main").unwrap()` which will **panic** if the main window is not present.

## Logs / Evidence To Capture
- [ ] Run the built binary from terminal to capture stdout/stderr.
  - macOS example: `./Blinko.app/Contents/MacOS/Blinko`
  - Windows example: `Blinko.exe` from the build output directory
  - Linux example: `./blinko` (or similar)
- [ ] If the app exits immediately, capture exit code.
- [ ] Check OS logs (macOS Console, Windows Event Viewer) for crash reports.
- [ ] Confirm whether a tray icon appears.

## Hypotheses
- [ ] **Hidden window with no tray**: main window is `visible: false` in config; if `setup_app` fails before `restore_main_window_state`, the window never shows.
- [ ] **Main window label mismatch**: `setup_app` assumes `label = "main"`; if `tauri.conf.json` fails to create the default window, `unwrap()` will panic and the app will exit silently.
- [ ] **Missing `frontendDist` artifacts**: `../../dist/public` not present at runtime causes a fatal error during webview creation.
- [ ] **Runtime panic in setup**: local runtime init or DB init failure could trigger errors that prevent the UI from appearing (verify logs).

## Fix Plan (Checklist)
- [ ] Reproduce in release build and capture logs from the built binary.
- [ ] Verify bundle output path and confirm `dist/public` exists and is packaged.
- [ ] Add explicit `label: "main"` to the primary window in `tauri.conf.json` to avoid label ambiguity.
- [ ] Avoid `unwrap()` on `get_webview_window("main")`; replace with a recoverable error path that logs and continues (showing at least a minimal window).
- [ ] Add early startup logging around `setup_app` to confirm it runs and whether `restore_main_window_state` is called.
- [ ] If the window is intentionally hidden at startup, ensure tray icon creation succeeds and that a visible action exists to show the main window.

## Regression Tests / Validation
- [ ] `bun run tauri:desktop:build` completes.
- [ ] Launch built app from Finder/Explorer; confirm main window appears within 3 seconds.
- [ ] Launch built app via terminal to confirm no panic on startup.
- [ ] If tray flow is intended: verify tray icon appears and can show the main window.

## Acceptance Criteria
- [ ] Built app launches and main window is visible (or tray icon appears and the window can be shown).
- [ ] No startup panics or silent exits in release builds.
- [ ] Documented troubleshooting steps in `DEV.md` or `docs/` if needed.

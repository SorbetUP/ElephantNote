# APEX Step 05 — Validate

Run the smallest command set that proves the touched area still works.

## Procedure

1. Run the relevant unit tests first.
2. Run typecheck/lint for the touched package.
3. Run integration or runtime checks when a bug involves bridges, filesystem, Tauri commands, sync, or UI flows.
4. Save exact command output in the response or task log.
5. Fix only failures caused by the change.
6. Re-run the failing command until it passes or a real blocker remains.

## Validation levels

- **Unit**: deterministic helper/component behavior.
- **Bridge**: Electron preload, Tauri invoke, Rust command, serialization contract.
- **Runtime**: app launches, window opens, logs show expected command path.
- **Workflow**: user action changes persisted state and survives reload.

## Rules

- Do not mark validation successful without a command or direct runtime evidence.
- Do not skip tests to make CI pass.
- Do not weaken assertions when the implementation is wrong.

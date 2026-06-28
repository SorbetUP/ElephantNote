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
- **CI topology**: workflow syntax, local script parity, job boundaries, and blocking gates.
- **Artifact**: bundle or diagnostic exists, has expected content, and is size-bounded.

## CI skill routing

Use these narrow skills while validating CI-related changes:

- `../../anti-fake-tests/SKILL.md` for test quality and observable assertions.
- `../../tauri-ci-verifier/SKILL.md` for Tauri build, bridge, Rust, window, and bundle confidence.
- `../../github-actions-linter/SKILL.md` for workflow YAML and shell command review.
- `../../cross-platform-paths/SKILL.md` for vault, hidden-folder, and OS path behavior.
- `../../ci-stability/SKILL.md` for intermittent checks and readiness conditions.

## Rules

- Do not mark validation successful without a command or direct runtime evidence.
- Do not skip tests to make CI pass.
- Do not weaken assertions when the implementation is wrong.
- Do not call a packaging, sync, filesystem, or Tauri fix validated if the real boundary was not exercised.

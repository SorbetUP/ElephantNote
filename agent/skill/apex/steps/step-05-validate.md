# APEX Step 05 — Validate

Run the smallest command set that proves the touched area still works. Validation must match the proof standard selected in Init and Plan.

## Procedure

1. Run the narrowest relevant test first.
2. Run package checks for the touched area when available.
3. Run integration or runtime checks when a bug involves bridges, filesystem, Tauri commands, sync, packaging, or UI flows.
4. Save exact command output in the response or task log.
5. Fix only failures caused by the change.
6. Re-run the failing command until it passes or a real blocker remains.
7. If a new skill was added, run the skill guard that proves it is listed and routed.

## Validation levels

- Unit: deterministic helper/component behavior.
- Bridge: preload, Tauri invoke, Rust command, and serialization contract.
- Runtime: app launches, window opens, logs show expected command path.
- User workflow: action changes persisted state and survives reload.
- CI topology: syntax, local script parity, job boundaries, and blocking gates.
- Artifact: bundle or diagnostic exists, has expected content, and is size-bounded.
- Skill routing: skill index, APEX routing, and guard tests know about new skills.

## Skill routing

Use narrow skills while validating:

- `../../anti-fake-tests/SKILL.md` for test quality and observable assertions.
- `../../tauri-ci-verifier/SKILL.md` for Tauri build, bridge, Rust, window, and bundle confidence.
- `../../github-actions-linter/SKILL.md` for workflow review.
- `../../cross-platform-paths/SKILL.md` for vault, hidden-folder, and OS path behavior.
- `../../ci-stability/SKILL.md` for intermittent checks and readiness conditions.
- `../../repo-skill-router/SKILL.md` for language/runtime skill coverage.

## Rules

- Do not mark validation successful without a command or direct runtime evidence.
- Do not weaken assertions when the implementation is wrong.
- Do not call a packaging, sync, filesystem, or Tauri fix validated if the real boundary was not exercised.
- Do not claim new skills are integrated unless the index, APEX router, and guard tests include them.

# APEX Step 05 — Validate

Run the smallest command set that proves the touched area still works. Validation must match the proof standard selected in Init and Plan.

## Repository CI rule

When repository CI is available, inspect workflow runs for the head commit as part of validation. Local commands are useful for fast debugging, but the final validation report must include the remote CI state: green, failed, pending, running, or blocked.

## Procedure

1. Run the narrowest relevant local test first when it helps catch mistakes quickly.
2. Run package checks for the touched area when available.
3. Push or edit the repo so CI runs for the head commit.
4. Inspect workflow runs for that commit.
5. For failed workflows, inspect jobs and failing steps before guessing.
6. Fix only failures caused by the change.
7. Re-check validation on the next pushed commit.
8. If a new skill was added, run the skill guard that proves it is listed and routed.

## Validation levels

- Unit: deterministic helper/component behavior.
- Bridge: preload, Tauri invoke, Rust command, and serialization contract.
- Runtime: app launches, window opens, logs show expected command path.
- User workflow: action changes persisted state and survives reload.
- CI topology: syntax, local script parity, job boundaries, and blocking gates.
- Remote CI: workflow runs, job status, failing step, and artifacts when useful.
- Artifact: bundle or diagnostic exists, has expected content, and is size-bounded.
- Skill routing: skill index, APEX routing, and guard tests know about new skills.

## Skill routing

Use narrow skills while validating:

- `../../ci-repair/SKILL.md` for the CI feedback loop.
- `../../anti-fake-tests/SKILL.md` for test quality and observable assertions.
- `../../tauri-ci-verifier/SKILL.md` for Tauri build, bridge, Rust, window, and bundle confidence.
- `../../github-actions-linter/SKILL.md` for workflow review.
- `../../cross-platform-paths/SKILL.md` for vault, hidden-folder, and OS path behavior.
- `../../ci-stability/SKILL.md` for intermittent checks and readiness conditions.
- `../../repo-skill-router/SKILL.md` for language/runtime skill coverage.

## Rules

- Validation success needs command, runtime, or CI evidence.
- Assertions stay meaningful when implementation is wrong.
- Packaging, sync, filesystem, and Tauri fixes need their real boundary exercised.
- New skills need index, APEX router, and guard test coverage.

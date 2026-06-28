# APEX Step 06 — eXamine

Run an adversarial review when `-x` is active or when the change is risky. The review must use the active skills and compare the diff against the real contract.

## Review tracks

1. Correctness: the implemented flow satisfies the acceptance criteria.
2. Safety: path handling, trust boundaries, IPC inputs, sync, deletes, and moves.
3. Clean code: apply Ponytail and remove avoidable code, abstractions, dependencies, and scaffolding.
4. Maintainability: behavior is covered by a real test or check.
5. Runtime truth: UI, bridge, filesystem, package, or artifact claims match the evidence.
6. Skill routing: new or relevant skills are listed, routed, and guarded.

## Procedure

1. Re-read the diff as if it was written by someone else.
2. Re-apply every active skill and list only concrete findings.
3. For every finding, name the file, risk, and minimal fix.
4. Separate must-fix issues from optional cleanup.
5. Check whether the chosen validation proves the user-visible or runtime boundary.

## Surface-specific review

- JavaScript/Vue: async state, loading loops, error visibility, stale stores, optimistic UI.
- Rust/Tauri: command registration, path guards, explicit errors, stable returned data.
- GitHub Actions: permissions, local reproducibility, skipped checks, artifact scope.
- Filesystem/sync: hidden folders, file-versus-directory handling, conflict behavior.
- Skills: no generic slogans; each skill must name invariants, files, checks, and anti-patterns.

## Output

Examine report must include must-fix findings, optional cleanup, Ponytail cuts, skill routing issues, and validation gaps.

## Rules

- Clean code review means Ponytail review, not formatting taste.
- Do not remove validation, safety, accessibility, or data-loss protections in the name of minimalism.
- Do not accept a green test that does not prove the real product behavior.
- Do not accept a new skill that is not connected to APEX or the skill index.

# APEX Step 09 — Verify

Prove the feature works at the surface where the user experiences it. Verification is stronger than validation: it connects passing checks to real user, runtime, workflow, or CI evidence.

## Repository CI verification

For repository changes, inspect remote workflow runs for the head commit when available. The verification report must name the commit, workflows checked, failed job or step when present, and the current state: green, failed, pending, running, or blocked.

## Procedure

1. Launch the smallest relevant runtime: unit runner, Electron dev app, Tauri dev app, Android/mobile flow, Docker pair, packaged app, or remote CI run.
2. Exercise the real user action or command path when runtime behavior is in scope.
3. Inspect logs when the feature involves async loading, IPC, filesystem, sync, local AI, packaging, or background jobs.
4. Confirm the result persists across reload when persistence is part of the feature.
5. Capture exact commands, workflow names, job status, and observed evidence.
6. For skill-system work, verify the skill is indexed, routed from APEX, guarded by tests, and specific to the repo stack.

## ElephantNote examples

- Editor/assets: insert image or Excalidraw, save, reload, verify Markdown points to `.assets` and preview renders.
- Vault tree: create, rename, move, delete folder; verify disk and UI agree.
- Tauri: build or dev launch opens the window and exposes required commands.
- Sync: mutate vault A, sync, verify vault B receives the real file and conflict behavior is explicit.
- Search/wiki/graph: create notes, index, query, verify exact and semantic paths return real notes.
- CI: show which workflow/job/script proves the changed contract and which artifact/log records the result.
- Skills: show which stack signal caused the skill to load and which guard prevents regression.

## CI verification skills

- `../../ci-repair/SKILL.md` for the remote CI feedback loop.
- `../../real-verification/SKILL.md` for final evidence reports.
- `../../artifact-release-gate/SKILL.md` for bundle and release artifact evidence.
- `../../runtime-ci-hardening/SKILL.md` for runtime command side effects and generated outputs.
- `../../supply-chain-verifier/SKILL.md` for dependency, lockfile, license, and scanner evidence.
- `../../github-actions-security/SKILL.md` for workflow security review during eXamine.
- `../../repo-skill-router/SKILL.md` for language/runtime skill coverage.

## Verification report

Report each claim as one of:

- proven: command/evidence included;
- partially proven: exact missing runtime, workflow, or platform named;
- not proven: blocker named;
- out of scope: reason named.

## Rules

- Browser/app verification needs browser/app evidence.
- Unit tests alone do not prove a window opens or a packaged app works.
- CI proof must name the relevant workflow, job, or script.
- Artifact readiness needs the actual generated path or diagnostics.
- Skill integration needs index, route, and guard coverage.
- Pending or running CI remains unproven until it finishes.

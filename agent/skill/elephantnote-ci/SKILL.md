---
name: elephantnote-ci
description: >
  Rules for CI repair, workflow changes, build/test gates, Tauri CI, Docker sync
  tests, and honest green status.
argument-hint: "<ci-task>"
---

# ElephantNote CI

Use this skill for GitHub Actions, failing tests, build scripts, lint/typecheck, Tauri CI, Docker sync tests, release checks, and quality gates.

## Invariants

- CI passing must mean the relevant behavior is actually checked.
- No skipped tests, `test.todo`, loosened assertions, or always-pass quality gates to get green.
- Fix the implementation before weakening a test.
- Keep CI commands close to local developer commands.
- Mac/Tauri window/build confidence requires a real build/bootstrap check, not just JS unit tests.

## Read first

- Failing workflow log and exact command.
- Workflow file and local package scripts.
- Tests that failed.
- Implementation touched by the failure.

## Procedure

1. Reproduce the failing command locally when possible.
2. Identify whether the failure is test bug, implementation bug, environment bug, or workflow bug.
3. Fix the smallest real cause.
4. Re-run the exact failing command.
5. If CI must wait, report the run state honestly.

## Anti-slop

No `|| true`, no broad ignore, no deleting coverage, no replacing a real e2e check with a smoke mount test.

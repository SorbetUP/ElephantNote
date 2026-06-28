# APEX Step 01 — Analyze

Gather enough context to avoid guessing. This step must connect the task to real files, tests, commands, data paths, and runtime boundaries.

## Procedure

1. Locate the files, tests, commands, and UI flows that the task can touch.
2. Read the closest existing implementation before proposing a new one.
3. Trace the real flow end to end: caller -> adapter/bridge -> backend command -> persistence/runtime -> UI update.
4. For bugs, identify the root cause candidate and every sibling caller that may share it.
5. For ElephantNote tasks, load the specific project skill matching the files found.
6. Use `agent/skill/repo-skill-router/SKILL.md` to refine language/runtime skills after the touched files are known.
7. If a needed language or subsystem skill is missing, create or propose a small local skill before broad implementation.
8. Record what evidence was actually inspected; do not claim verification from assumptions.

## Required evidence

- File paths read.
- Relevant functions/components/commands.
- Existing tests that cover or should cover the area.
- Runtime logs or error messages when the bug involves loading loops, async state, bridge calls, filesystem writes, packaging, or sync.
- The exact language/runtime surface: JavaScript/Vue, Rust/Tauri, Electron, Docker, GitHub Actions, Android, Markdown/vault, local AI, or sync.

## Analysis depth by task type

- **Bug**: reproduce the failure path from report, log, code, or test before patching.
- **Feature**: identify the persistence model, UI state, error states, and tests before adding UI.
- **CI**: map workflow step -> local script -> command -> expected proof.
- **Tauri/Electron bridge**: inspect both renderer caller and backend handler.
- **Filesystem/sync**: inspect path normalization, hidden folders, disk state, and cleanup behavior.
- **Skill-system change**: inspect the existing skill index, APEX router, step files, and guard tests.

## Skill selection output

For each skill loaded during analysis, record:

- why it applies;
- which files caused it to be loaded;
- what invariant it contributes;
- whether a missing skill should be added for this repo.

## Output

```md
## Analyze
Files read:
- ...
Detected stack:
- ...
Skills loaded/refined:
- skill: reason
Flow:
- ...
Root cause / implementation target:
- ...
Existing tests:
- ...
Evidence inspected:
- ...
Open questions:
- ...
```

## Rules

- Do not diagnose from screenshots alone when logs or code paths are available.
- Do not patch only the named component if a shared helper is the real bug source.
- Do not invent a backend, bridge, runtime, or skill that the repo does not need.
- Prefer reading one more relevant file over guessing an architecture.

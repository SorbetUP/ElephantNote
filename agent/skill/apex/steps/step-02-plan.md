# APEX Step 02 — Plan

Write a file-by-file plan before editing. The plan must convert analysis into the smallest implementation path and the proof that will make the change trustworthy.

## Procedure

1. Convert acceptance criteria into the smallest implementation path.
2. Apply Ponytail before writing new code:
   - reuse existing helpers and patterns;
   - prefer standard library / platform capabilities;
   - avoid new dependencies;
   - avoid one-off abstractions;
   - delete broken duplicate code instead of adding parallel paths.
3. Choose the language/runtime skill for each file group: JavaScript/Vue, Rust/Tauri, Electron, CI, Docker, sync, filesystem, local AI, mobile, or docs.
4. If analysis found a missing skill that affects the current work, plan the skill addition first and guard it with a small test/check.
5. List every file to create/change and the exact reason.
6. List tests to add or update before implementation when practical.
7. List validation commands and the expected proof level for each command.
8. Keep the code runnable after each step.

## Plan quality gate

Before executing, the plan must answer:

- What user-visible or runtime contract will change?
- What test would fail on the old behavior?
- What real command proves the changed boundary?
- Which skills are active and why?
- What will not be changed?

## Output

```md
## Plan
Active skills:
- skill: reason
Files:
- path: change
Tests:
- path: expected regression caught
Validation commands:
- command: proof level
Runtime/artifact verification:
- ...
Missing skills to add:
- path: why now
Out of scope:
- ...
Skipped by Ponytail:
- unnecessary abstraction/dependency/refactor
```

## Rules

- No "while here" refactors.
- No speculative future config.
- No fake backend/frontend shim to make UI appear functional.
- No skill creation unless the current repo stack and task make it useful now.
- No validation plan that only proves the code compiles when the user asked for runtime behavior.

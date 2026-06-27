# APEX Step 02 — Plan

Write a file-by-file plan before editing.

## Procedure

1. Convert acceptance criteria into the smallest implementation path.
2. Apply Ponytail before writing new code:
   - reuse existing helpers and patterns;
   - prefer standard library / platform capabilities;
   - avoid new dependencies;
   - avoid one-off abstractions;
   - delete broken duplicate code instead of adding parallel paths.
3. List every file to create/change and the exact reason.
4. List tests to add or update before implementation when practical.
5. Keep the code runnable after each step.

## Output

```md
## Plan
Files:
- path: change
Tests:
- path: expected regression caught
Validation commands:
- command
Skipped by Ponytail:
- unnecessary abstraction/dependency/refactor
```

## Rules

- No "while here" refactors.
- No speculative future config.
- No fake backend/frontend shim to make UI appear functional.

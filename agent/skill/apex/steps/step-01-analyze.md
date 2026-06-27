# APEX Step 01 — Analyze

Gather enough context to avoid guessing.

## Procedure

1. Locate the files, tests, commands, and UI flows that the task can touch.
2. Read the closest existing implementation before proposing a new one.
3. Trace the real flow end to end: caller → adapter/bridge → backend command → persistence/runtime → UI update.
4. For bugs, identify the root cause candidate and every sibling caller that may share it.
5. For ElephantNote tasks, load the specific project skill matching the files found.
6. Record what evidence was actually inspected; do not claim verification from assumptions.

## Required evidence

- File paths read.
- Relevant functions/components/commands.
- Tests that already cover the area.
- Runtime logs or error messages, when the bug involves loading loops, async state, bridge calls, or filesystem writes.

## Output

```md
## Analyze
Files read:
- ...
Flow:
- ...
Root cause / implementation target:
- ...
Open questions:
- ...
```

## Rules

- Do not diagnose from screenshots alone when logs or code paths are available.
- Do not patch only the named component if a shared helper is the real bug source.

# APEX Step 03 — Tasks

Break a larger change into dependency-ordered tasks when `-k` or `-m` is active, or when the work spans multiple subsystems.

## Procedure

1. Split work by verifiable unit.
2. Make dependencies explicit.
3. Keep each task small enough to review.
4. Separate tasks only when they do not edit the same files.
5. Give every task a concrete check.

## Output

```md
## Tasks
1. Task name
   - depends on: none
   - files: ...
   - check: ...
2. Task name
   - depends on: 1
   - files: ...
   - check: ...
```

## Rules

- Do not split work that edits the same shared files into concurrent tasks.
- Do not create task plans for trivial one-file fixes unless asked.

# APEX Step 07 — Resolve

Fix findings from validation or examine without expanding the scope.

## Procedure

1. Triage each finding as real, not reproduced, or out of scope.
2. Fix real findings with the smallest change that addresses the root cause.
3. Add or adjust a check only when it proves the resolved behavior.
4. Re-run the exact command or workflow that exposed the issue.
5. Keep a short resolution log.

## Output

```md
## Resolve
Fixed:
- finding → file → check
Deferred:
- reason
Re-run:
- command/result
```

## Rules

- Do not fix unrelated pre-existing failures unless they block proving the current task.
- Do not hide failures behind skips, mocks that bypass the behavior, or softened assertions.

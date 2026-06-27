# APEX Step 06 — eXamine

Run an adversarial review when `-x` is active or when the change is risky.

## Review tracks

1. **Correctness** — the implemented flow satisfies the acceptance criteria.
2. **Security** — path safety, command execution, secrets, trust boundaries, IPC inputs.
3. **Data safety** — no data loss, no broken sync, no unsafe deletes or moves.
4. **Clean code** — apply Ponytail: remove avoidable code, abstractions, dependencies, and scaffolding.
5. **Maintainability** — behavior is covered by a real test or check.

## Procedure

1. Re-read the diff as if it was written by someone else.
2. List concrete findings only; no vague style opinions.
3. For every finding, name the file, risk, and minimal fix.
4. Separate must-fix issues from optional cleanup.

## Output

```md
## Examine
Must fix:
- ...
Optional:
- ...
Ponytail cuts:
- ...
```

## Rules

- Clean code review means Ponytail review, not formatting taste.
- Do not remove validation, security, accessibility, or data-loss protections in the name of minimalism.

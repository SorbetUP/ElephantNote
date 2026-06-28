# APEX Step 07 — Resolve

Fix findings from validation or examine without expanding the scope. Resolution must address the root cause and then re-run the proof that exposed the issue.

## Procedure

1. Triage each finding as real, not reproduced, already covered, or out of scope.
2. Fix real findings with the smallest change that addresses the root cause.
3. Add or adjust a check only when it proves the resolved behavior.
4. Re-run the exact command or workflow that exposed the issue.
5. Keep a short resolution log.
6. If a skill routing issue was found, update the skill, index, APEX route, and guard test together.
7. If a validation gap was found, add the missing proof before claiming the task complete.

## Resolution priorities

1. Correctness and data safety.
2. Runtime or user-visible failure.
3. Broken test or CI gate.
4. Missing skill routing or guard.
5. Ponytail cleanup that reduces risk without widening scope.

## Output

Resolve report must include fixed findings, skill routing changes, deferred items, re-run commands/results, and remaining blockers.

## Rules

- Do not fix unrelated pre-existing failures unless they block proving the current task.
- Do not soften assertions just to make a check pass.
- Do not close a finding without a fix, a reproduced non-issue explanation, or an out-of-scope note.
- Do not add a new skill without connecting it to the index and the relevant APEX step.

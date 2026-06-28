# APEX Step 03 — Tasks

Break a larger change into dependency-ordered tasks when `-k` or `-m` is active, or when the work spans multiple subsystems.

## Procedure

1. Split work by verifiable unit.
2. Make dependencies explicit.
3. Keep each task small enough to review.
4. Assign the relevant skills to each task.
5. Give every task a concrete check.
6. Put skill creation before implementation when implementation depends on the new skill.

## Task boundaries

Prefer boundaries such as one bridge contract, one Rust command, one UI flow, one workflow job, one filesystem invariant, or one skill addition. Each boundary needs its own check.

Avoid boundaries that mix cleanup with bug fixes, weaken tests before implementation exists, or create speculative skills not required by the current acceptance criteria.

## Output

Task report must include task name, dependencies, skills, files, check, and risk.

## Rules

- Do not create task plans for trivial one-file fixes unless asked.
- Do not assign a task without a validation check.
- Do not split tasks that share the same generated files, global state, or workflow.

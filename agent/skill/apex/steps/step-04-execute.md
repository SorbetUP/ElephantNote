# APEX Step 04 — Execute

Implement the planned change with the smallest correct diff.

## Procedure

1. Create or update tests first when the expected behavior can be isolated cheaply.
2. Edit only the planned files unless analysis proves the plan was incomplete.
3. Match surrounding naming, error handling, async style, logging, and test style.
4. Prefer shared helpers over per-component guards.
5. Keep UI state and persistence flows real; do not add display-only success states.
6. Run the formatter used by the touched package when available.

## Ponytail gate

Before adding code, ask:

- Can existing code already do this?
- Can a smaller shared fix solve all callers?
- Can a native platform feature or existing dependency replace this code?
- Can code be deleted instead?

## Rules

- No fake implementations.
- No temporary placeholders presented as working features.
- No broad refactors outside the task.

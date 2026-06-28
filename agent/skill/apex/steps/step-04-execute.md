# APEX Step 04 — Execute

Implement the planned change with the smallest correct diff. Execution must follow the active skills instead of generic coding habits.

## Procedure

1. Create or update tests first when the expected behavior can be isolated cheaply.
2. Edit only the planned files unless analysis proves the plan was incomplete.
3. Match surrounding naming, error handling, async style, logging, and test style.
4. Prefer shared helpers over per-component guards.
5. Keep UI state and persistence flows real.
6. Follow the implementation rules from every active language/runtime skill.
7. When adding a missing skill, add it before the implementation that depends on it and update the skill index.
8. Run the formatter used by the touched package when available.

## Ponytail gate

Before adding code, ask whether existing code can already do it, whether a smaller shared fix solves all callers, whether platform features can replace custom code, and whether code can be deleted instead.

## Execution rules by surface

- JavaScript/Vue: keep async state explicit, expose errors, and verify store/service/bridge calls.
- Rust/Tauri: keep errors explicit, preserve path guards, and keep data shapes stable.
- CI: keep commands reproducible locally and permissions narrow.
- Filesystem/sync: assert real disk state and avoid root/path confusion.
- Skills: keep skill files focused on invariants, files to read, commands, tests, and anti-patterns.

## Rules

- No fake implementations.
- No temporary placeholders presented as working features.
- No broad refactors outside the task.
- No new abstraction unless it removes duplication or improves testability for this exact change.
- No changed test expectation unless the new expectation is the real product contract.

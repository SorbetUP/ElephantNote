# APEX Step 08 — Tests

Create or update tests when `-t` is active, or whenever the change contains non-trivial logic. Tests must prove observable behavior and be tied to the active skills.

## Procedure

1. Write the smallest test that fails on the old behavior and passes on the fix.
2. Prefer existing test style and helpers.
3. Cover the regression path, not implementation details.
4. Add integration tests for bridges and persistence flows when unit tests cannot prove user-visible behavior.
5. Avoid snapshots unless they protect a stable contract.
6. Use `../../anti-fake-tests/SKILL.md` before accepting a new or changed test.
7. If a new skill is added, add a contract test or guard that confirms it is listed and routed.

## Test selection

- Pure helper: unit test.
- Store/state transition: unit test with real store APIs.
- Tauri/Electron bridge: serialization/command contract test.
- Markdown/assets: round-trip Markdown string and disk path expectations.
- Sync: two-vault or docker-style integration when possible.
- UI parity: component render plus screenshot/manual verification note when needed.
- CI skill system: read skill files and assert index/routing/guard invariants.
- Language/runtime skill: assert the skill exists only when the repo stack justifies it.

## Test quality checklist

- Would this fail if the implementation wrote no file, called the wrong command, or returned fake success?
- Does it assert the product contract rather than implementation trivia?
- Does it avoid mocking the exact behavior under test?
- Does it cover the error path when the user would see an error?
- Does it run with a deterministic fixture or temp root?

## Rules

- No smoke-only tests that assert only that a component mounts.
- No skipped tests.
- No fake success mocks for the behavior under test.
- No skill-system change without a guard test when the skill will guide future implementation.

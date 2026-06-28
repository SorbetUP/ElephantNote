# APEX Step 08 — Tests

Create or update tests when `-t` is active, or whenever the change contains non-trivial logic.

## Procedure

1. Write the smallest test that fails on the old behavior and passes on the fix.
2. Prefer existing test style and helpers.
3. Cover the regression path, not implementation details.
4. Add integration tests for bridges and persistence flows when unit tests cannot prove user-visible behavior.
5. Avoid snapshots unless they protect a stable contract.

## Test selection

- Pure helper: unit test.
- Store/state transition: unit test with real store APIs.
- Tauri/Electron bridge: serialization/command contract test.
- Markdown/assets: round-trip Markdown string and disk path expectations.
- Sync: two-vault or docker-style integration when possible.
- UI parity: component render plus screenshot/manual verification note when needed.

## Rules

- No smoke-only tests that assert only that a component mounts.
- No skipped tests.
- No fake success mocks for the behavior under test.

---
name: ci-repair
description: >
  Fix failing CI by reproducing the real failing command, repairing the real
  cause, and keeping tests meaningful.
argument-hint: "<ci-failure>"
---

# CI Repair

Use this skill for failing GitHub Actions, local test failures, typecheck/lint failures, and build regressions.

## Procedure

1. Read the exact failing job, command, and error.
2. Run or reason from the same command, not a looser substitute.
3. Locate whether the failure is caused by code, test expectation, environment, or workflow config.
4. Fix the smallest real cause.
5. Re-run the failing command.
6. Summarize remaining CI uncertainty honestly.

## Hard bans

- No skipped tests.
- No `|| true` gates.
- No weakening assertions to match broken behavior.
- No deleting meaningful coverage.
- No fake build artifact to satisfy upload steps.

## Output

```md
CI repair:
- failing command:
- root cause:
- fix:
- re-run result:
```

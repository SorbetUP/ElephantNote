# APEX Step 10 — Finish

Summarize what changed and what was proven. Finish must be factual, auditable, and limited to evidence actually gathered.

## Procedure

1. List changed files by category.
2. Mark each acceptance criterion as proven, partially proven, not proven, or blocked.
3. Include exact validation commands and outcomes.
4. Include runtime, workflow, artifact, skill-routing, and CI evidence when relevant.
5. For repository work, include the head commit SHA and remote CI state when CI is available.
6. Mention skipped verification only with a concrete reason.
7. If a pull request is requested, keep the PR body factual and test-focused.
8. List new skills added and the repo evidence that justified them.
9. List remaining risks without hiding them.

## Output

Finish report must include task, criteria status, files changed by category, validation, verification, new or updated skills, head commit, workflows checked, CI state, and remaining risks.

## Final answer rules

- Say exactly what was changed.
- Say exactly what was not run or not proven.
- Include failed, pending, running, or blocked CI status honestly.
- Mention the last commit SHA when working through GitHub.
- Do not say a feature is fully working unless the relevant runtime or workflow was exercised.
- Do not hand off validation to the user when remote CI is available to inspect.
- Keep the summary short enough to audit.

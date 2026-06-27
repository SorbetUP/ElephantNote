# APEX Step 00 — Init

Initialize an APEX run before touching code.

## Inputs

- Raw task text.
- Flags such as `-x`, `-t`, `-v`, `-s`, `-e`, `-k`, `-m`, `-pr`.
- Current branch and dirty-worktree constraints, when available.

## Procedure

1. Parse the task into one sentence.
2. Parse flags and decide which optional steps are active.
3. Identify whether the task is a feature, bug fix, refactor, CI repair, verification task, or project cleanup.
4. Load `agent/AGENTS.md` and the most specific project skills.
5. If clean code, maintainability, or over-engineering appears anywhere in the task, load `agent/skill/ponytail/SKILL.md`.
6. Write 2-4 acceptance criteria that can be proven.

## Output

```md
## Init
Task: ...
Flags: ...
Skills loaded: ...
Acceptance criteria:
- [ ] ...
```

## Stop conditions

Ask only when a wrong assumption could cause data loss, security exposure, or a large wrong implementation.

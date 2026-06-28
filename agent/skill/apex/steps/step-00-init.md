# APEX Step 00 — Init

Initialize an APEX run before touching code. This step decides the task shape, the initial skill set, and the proof standard.

## Inputs

- Raw task text.
- Flags such as `-x`, `-t`, `-v`, `-s`, `-e`, `-k`, `-m`, `-pr`.
- Current branch and dirty-worktree constraints, when available.
- Repository-local instructions: `agent/AGENTS.md`, `agent/skill/README.md`, and the most relevant project skills.

## Mandatory skill bootstrap

1. Load `agent/skill/repo-skill-router/SKILL.md` for non-trivial repo work.
2. Load `agent/AGENTS.md` when present.
3. Load the narrow project skill matching the task domain.
4. If clean code, maintainability, simplification, over-engineering, or boilerplate appears anywhere in the task, load `agent/skill/ponytail/SKILL.md`.
5. If the task touches tests, CI, verification, release, packaging, filesystem, sync, Tauri, or bridge behavior, load the matching verification skill immediately.

## Stack detection

Before planning, inspect the lightest repo evidence needed:

- language/package manifests;
- CI workflows and reusable actions;
- runtime folders such as `src-tauri`, `Elephant`, `src`, `web`, `android`, `test`, `tests`, `e2e`;
- config files for lint, tests, bundlers, and formatters;
- existing skills under `agent/skill`.

If a major present language/framework/runtime has no local skill and the current task depends on it, add a small focused skill or explicitly list it as a missing skill to create before implementation. Do not invent skills for technologies that are not present.

## Procedure

1. Parse the task into one sentence.
2. Parse flags and decide which optional steps are active.
3. Identify whether the task is a feature, bug fix, refactor, CI repair, verification task, skill-system change, or project cleanup.
4. Detect the repository stack relevant to the task.
5. Select the initial skill set and record why each skill is loaded.
6. Write 2-4 acceptance criteria that can be proven by commands, tests, runtime evidence, or repository state.
7. Define the minimum proof standard: unit, bridge, runtime, workflow, artifact, security, or release evidence.

## Output

Init report must include: task, flags, task type, detected stack, loaded skills, missing skills to add or propose, acceptance criteria, and proof standard.

## Stop conditions

Ask only when a wrong assumption could cause data loss, public API breakage, or a large wrong implementation. Otherwise choose the safest narrow assumption and continue.

# Agent Skills

This folder contains repository-local agent skills for ElephantNote.

## Core skills

- `apex/` — structured Analyze → Plan → Execute → eXamine workflow.
- `ponytail/` — upstream clean-code/minimal-diff skill.
- `clean-code-ponytail/` — adapter that routes clean-code requests to Ponytail.
- `real-verification/` — prove features work with real commands, logs, and UI/runtime checks.
- `root-cause-debugging/` — diagnose from code paths and logs before patching.
- `ci-repair/` — fix CI honestly without skips or fake green gates.

## APEX subskills

APEX step prompts live in `apex/steps/`:

- `step-00-init.md`
- `step-01-analyze.md`
- `step-02-plan.md`
- `step-03-tasks.md`
- `step-04-execute.md`
- `step-05-validate.md`
- `step-06-examine.md`
- `step-07-resolve.md`
- `step-08-tests.md`
- `step-09-verify.md`
- `step-10-finish.md`

APEX saved-run template: `apex/templates/run-report.md`.

## ElephantNote project skills

- `elephantnote-project/` — default project rules.
- `elephantnote-tauri/` — Tauri/Rust bridge and window behavior.
- `elephantnote-electron/` — Electron legacy bridge and parity rules.
- `elephantnote-editor-assets/` — Markdown, images, Excalidraw, `.assets`.
- `elephantnote-vault-fs/` — vault tree, hidden folders, file safety.
- `elephantnote-sync/` — rclone/LAN/mobile sync.
- `elephantnote-search-wiki-graph/` — search, embeddings, graph, wiki.
- `elephantnote-ai-runtime/` — local AI runtimes, providers, OCR, model library.
- `elephantnote-ui-parity/` — Electron/Tauri/mobile UI parity.
- `elephantnote-ci/` — workflows, tests, build gates.
- `elephantnote-debugging/` — logs, async races, loading loops.
- `elephantnote-addons/` — addons/plugins and capability prompts.
- `elephantnote-mobile/` — Android/mobile behavior and desktop parity.

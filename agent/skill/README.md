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

## CI and verification skills

Use these together with APEX whenever a change touches GitHub Actions, Tauri CI, tests, packaging, artifacts, dependencies, or runtime confidence:

- `ci-architect/` — workflow topology, job boundaries, runner strategy, cache and artifact policy.
- `github-actions-linter/` — workflow syntax, contexts, triggers, shell snippets, and reusable actions.
- `github-actions-security/` — workflow permissions, PR safety, third-party actions, and CI security posture.
- `runtime-ci-hardening/` — runtime behavior, generated files, logs, and cache boundaries.
- `anti-fake-tests/` — tests must prove observable behavior and fail for real regressions.
- `tauri-ci-verifier/` — Tauri build, Rust command, bridge, window, bundle, and platform checks.
- `cross-platform-paths/` — path behavior across macOS, Linux, Windows, Android, Docker, Electron, and Tauri.
- `ci-stability/` — intermittent CI failures, readiness checks, isolated temp data, and cleanup.
- `supply-chain-verifier/` — dependencies, lockfiles, licenses, CodeQL, Dependabot, and generated artifacts.
- `artifact-release-gate/` — bundle existence, launch evidence, checksums, artifact size, and diagnostics.

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

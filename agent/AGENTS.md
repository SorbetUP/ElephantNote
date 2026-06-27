# ElephantNote Agent Instructions

Use these local skills before editing this repository. They are project instructions, not application runtime code.

## Default stack

1. Read `agent/skill/elephantnote-project/SKILL.md` for every ElephantNote task.
2. Use `agent/skill/apex/SKILL.md` for feature work, bug fixes, refactors, and CI repair.
3. Use `agent/skill/ponytail/SKILL.md` whenever a decision involves clean code, over-engineering, boilerplate, abstractions, or dependency choice.
4. Use the most specific ElephantNote skill for the area being touched.

## Routing

| Task area | Read first |
|---|---|
| Tauri / Rust commands / window behavior | `agent/skill/elephantnote-tauri/SKILL.md` |
| Electron / legacy backend bridge | `agent/skill/elephantnote-electron/SKILL.md` |
| Markdown editor, images, Excalidraw, attachments | `agent/skill/elephantnote-editor-assets/SKILL.md` |
| Vault tree, hidden folders, path safety | `agent/skill/elephantnote-vault-fs/SKILL.md` |
| Sync, LAN pairing, rclone, mobile/desktop parity | `agent/skill/elephantnote-sync/SKILL.md` |
| Search, embeddings, graph, wiki, knowledge chunks | `agent/skill/elephantnote-search-wiki-graph/SKILL.md` |
| Local AI runtimes, model library, providers, OCR | `agent/skill/elephantnote-ai-runtime/SKILL.md` |
| UI parity Electron/Tauri/mobile | `agent/skill/elephantnote-ui-parity/SKILL.md` |
| CI failures and GitHub workflows | `agent/skill/elephantnote-ci/SKILL.md` |
| Logs, loop bugs, async races | `agent/skill/elephantnote-debugging/SKILL.md` |
| Proving a feature really works | `agent/skill/real-verification/SKILL.md` |

## Non-negotiables

- Do not add fake implementations, smoke-only code, placeholder success paths, skipped tests, or quality gates that always pass.
- Every non-trivial change needs a real check that would fail if the implementation regresses.
- Fix the root cause once in the shared flow; do not patch only the visible symptom.
- Keep hidden app folders hidden from the user-facing vault explorer: `.assets`, `.dashboard`, `.embeddings`, `.wiki`, and similar internal folders.

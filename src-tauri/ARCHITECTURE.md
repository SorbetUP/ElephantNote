# Tauri backend architecture

Goal: one shared renderer, one modular Rust backend, no separate native Java clone.

Active modules:

- lib_min.rs: temporary Tauri command registry.
- vault/: active modular vault backend.
- vault/types.rs: vault descriptors and config domain types.
- vault/config.rs: app-level vault registry read/write and active vault selection.
- vault/metadata.rs: hidden vault metadata initialization.
- vault/entries.rs: visible vault content operations.
- vault/commands.rs: Tauri command wrappers for vault operations.
- vault_layout.rs: canonical hidden/visible vault layout contract.
- markdown_engine.rs: Markdown metadata engine.
- path_utils.rs: generic path helpers.
- note_domain.rs: note naming and Markdown creation.
- folder_domain.rs: folder path primitives.
- drawing_domain.rs: drawing scene primitives.
- media_domain.rs: media detection primitives.
- model_domain.rs: model selection primitives.
- search_logic.rs: search query and scoring primitives.

Legacy modules:

- vault_min.rs: old monolithic vault command glue. It is no longer imported by lib_min.rs and should be deleted after the modular backend survives local testing.

Rule: new behavior goes into a small domain module with tests first. Tauri commands should only call those modules.

Future folders: core, markdown, notes, folders, drawings, media, models, search, sync, commands.

Coverage rule: domain modules must keep at least 90 percent line coverage. Temporary command glue is excluded from the first coverage gate until it is split into smaller testable files.

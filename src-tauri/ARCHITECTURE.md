# Tauri backend architecture

Goal: one shared renderer, one modular Rust backend, no separate native Java clone.

Active modules:

- lib_min.rs: temporary Tauri command registry.
- vault_min.rs: temporary command glue.
- markdown_engine.rs: Markdown metadata engine.
- path_utils.rs: generic path helpers.
- vault_lib.rs: vault config and workspace primitives.
- note_domain.rs: note naming and Markdown creation.
- folder_domain.rs: folder path primitives.
- drawing_domain.rs: drawing scene primitives.
- media_domain.rs: media detection primitives.
- model_domain.rs: model selection primitives.
- search_logic.rs: search query and scoring primitives.

Rule: new behavior goes into a small domain module with tests first. Tauri commands should only call those modules.

Future folders: core, markdown, vault, notes, folders, drawings, media, models, search, sync, commands.

Coverage rule: domain modules must keep at least 90 percent line coverage. Temporary command glue is excluded from the first coverage gate until it is split into smaller testable files.

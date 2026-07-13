# Elephant addon packs

This branch owns the versioned first-party `.enaddonpack` definitions.

- `develop-parity.enaddonpack` installs the full first-party setup.
- `base.enaddonpack` installs the same setup without Calendar.

Entries with `source: "official"` are resolved through the signed/verified Elephant addon catalogue and do not require enabling third-party Community Addons. Entries with `source: "builtin"` are capabilities that remain part of the core application.

The pack order is dependency-aware: `elephant.ai` is installed before Chat, Semantic Search, OCR, Wiki, Graph and Codex.

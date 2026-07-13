# Elephant addon packs

This branch owns the versioned first-party `.enaddonpack` definitions.

- `develop-parity.enaddonpack` installs the full first-party optional package setup.
- `base.enaddonpack` installs the same setup without Calendar.

Entries with `source: "official"` are resolved through the verified Elephant addon catalogue and do not require enabling third-party Community Addons.

Addon Packs and Excalidraw are core application features, not addons. They are therefore always available and never appear as installable, removable or configurable entries inside an addon pack.

Google Keep Import and Recently edited are genuine optional packages. They are installed from the official catalogue like the other `elephant.*` addons and are physically absent when not installed.

The pack order is dependency-aware: `elephant.ai` is installed before Chat, Semantic Search, OCR, Wiki, Graph and Codex.

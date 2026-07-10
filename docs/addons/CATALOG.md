# Official Addon Catalogue

ElephantNote reads the official catalogue from the dedicated `addon-catalog` branch of this repository.

The branch snapshot contains only:

```text
catalog.json
ADDON_CATALOG.md
addons/
  <slug>/
    manifest.json
    main.js
    README.md
```

## Runtime flow

1. Settings asks Rust for `tauri_addons_catalog_list`.
2. Rust downloads the fixed `catalog.json` URL from `raw.githubusercontent.com`.
3. Catalogue paths are rejected if they are absolute, contain traversal, or leave `addons/<slug>/`.
4. Installing an entry downloads its manifest and JavaScript entry from the same fixed branch.
5. Catalogue name, identifier and version must match the downloaded manifest.
6. Rust creates a temporary `.enaddon` ZIP locally.
7. The archive is passed through the normal package validator and per-vault registry.
8. The package is registered disabled; the user reviews permissions and enables it explicitly.

The application does not accept an arbitrary catalogue URL. Changing the official source requires a reviewed application code change.

## Current catalogue

### Inbox Digest

Reads permitted Markdown notes under `Inbox/**` and generates `Reports/Inbox Digest.md`. It extracts titles, statuses, summaries and unchecked-task counts without modifying source notes.

### Finance Notes

Builds a multi-asset market dashboard and per-symbol notes. Successful quotes are cached; a later network failure can use the last valid quote while marking it explicitly as cached.

### Addon Platform Proof

Executes a deterministic acceptance path for Worker activation, command registration, application metadata, private storage and scoped note list/read/write APIs.

## Publishing an addon

Add the source under `addons/<slug>/`, then add one entry to `catalog.json` with matching `id`, `name` and `version` values. The catalogue and manifest values must match or installation fails.

Before publication, run:

```bash
node build/scripts/validate-addon-catalog.mjs path/to/addon-catalog
node build/scripts/test-official-addons.mjs path/to/addon-catalog
```

Updating an addon requires incrementing the version in both files. ElephantNote displays **Update** when the listed version differs from the installed version.

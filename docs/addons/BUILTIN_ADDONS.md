# Built-in starter addons

ElephantNote ships four built-in addons so users and developers can see the addon lifecycle and contribution APIs without installing third-party code.

## Daily Notes

Enabled by default.

- Command: **Create today's daily note**
- Writes `Daily/YYYY-MM-DD.md`
- Creates the note only when it does not already exist
- Adds frontmatter, a notes section and a task section

## Quick Capture

Enabled by default.

- Command: **Create a quick capture note**
- Writes a unique timestamped note under `Inbox/`
- Intended for ideas that will be classified or moved later

## Vault Overview

Enabled by default.

- Command: **Generate vault overview**
- Inspects the real Markdown index and resolved wiki links
- Writes or updates `Reports/Vault Overview.md`
- Reports note count, resolved links and notes without resolved links

## Addon Inspector

Disabled by default.

- Developer-oriented example
- Demonstrates action, settings and sidebar contributions
- Opens the Addons settings page

Built-in addons are compiled with ElephantNote and do not require Community Addons mode. User-installed packages are stored per vault under:

```text
.elephantnote/addons/
├── registry.json
├── packages/
│   └── <addon-id>/
└── data/
    └── <addon-id>/storage.json
```

The `.elephantnote` directory remains hidden from the normal vault explorer.

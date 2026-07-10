# Template Studio

An original ElephantNote workflow inspired by template plugins found in Obsidian and Joplin.

## Usage

Run **Create note from template**. The addon reads Markdown files under `Templates/` and creates a note under `Generated/YYYY-MM-DD/`.

On first use it creates `Templates/Default.md` automatically.

Supported variables:

- `{{title}}`
- `{{slug}}`
- `{{date}}`
- `{{time}}`
- `{{datetime}}`
- `{{year}}`, `{{month}}`, `{{day}}`
- `{{template}}`
- `{{uuid}}`

Programmatic command callers may provide `{ template, title, variables }`. Unknown variables remain visible instead of being silently removed.

Permissions are limited to reading/writing `Templates/**` and writing `Generated/**`.

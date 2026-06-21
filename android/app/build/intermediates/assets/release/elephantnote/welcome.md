# Welcome to ElephantNote Android

folder: Getting Started
#android #elephantnote #welcome

ElephantNote Android is an offline-first companion build for the desktop vault.
It is intentionally native: notes, sources, calendar events, canvas sketches,
model slots and sync metadata are stored locally on the phone without requiring
an Electron runtime.

## What is included

- Markdown quick capture with title inference.
- Local note editing, deletion and clipboard copy.
- Tags extracted from `#tag` tokens.
- Logical folders with a `folder: Projects` line.
- Search across titles, folders, body content and tags.
- Backlink discovery from `[[Note Title]]` references.
- Vault graph summaries for notes, tags, tag links and backlinks.
- Wiki topics generated from the tag index.
- Source URL capture into source records and Markdown source notes.
- Calendar event capture for mobile planning.
- Canvas sketching with persisted touch strokes.
- Model role slots for embedding, chat and OCR configuration.
- Sync identity fields for desktop-compatible handoff.
- Markdown import and export through the Android clipboard.

## Expected workflow

1. Capture notes during the day in the Notes tab.
2. Add `folder:` and `#tags` when context is known.
3. Save links in Sources so they also become Markdown notes.
4. Add short dated items in Calendar.
5. Review Graph and Wiki to see relationships.
6. Export Markdown from Sync when you want to move the mobile vault back to desktop.

## Desktop handoff

The Android build stores a compact local vault and exports Markdown with
frontmatter. Desktop ElephantNote can refine this content with richer runtimes:
OCR, local model execution, Excalidraw files, full MarkText editing and Electron
IPC integrations.


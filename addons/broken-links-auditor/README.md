# Broken Links Auditor

Scans all Markdown notes in the active vault and generates `Reports/Broken Links.md`.

It reports:

- unresolved wikilinks;
- ambiguous basename-only wikilinks;
- the source note and line number;
- candidate notes when a link is ambiguous.

The addon reads Markdown files only and never rewrites source notes.

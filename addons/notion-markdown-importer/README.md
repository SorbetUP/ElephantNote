# Notion Markdown Importer

Imports a Notion Markdown export that has been extracted or copied into:

```text
Imports/Notion/
```

The addon writes imported notes under:

```text
Imported/Notion/
```

It preserves the folder hierarchy, removes trailing 32-character Notion UUIDs from file and folder names, avoids output collisions, rewrites resolvable internal Markdown links to ElephantNote wikilinks, and generates `Reports/Notion Import.md`.

This is a local export importer. It does not claim to provide direct Notion API synchronization or OAuth. Attachments are not imported by addon API v1 and are listed as an explicit limitation in the report.

# Vault Changelog

An original snapshot-based changelog inspired by vault activity plugins.

Each manual run compares visible Markdown metadata with the previous snapshot and reports:

- created notes;
- modified notes;
- deleted note paths.

The first run creates a baseline and lists the most recently modified notes. Later runs write the comparison to `Reports/Vault Changelog.md` and replace the private metadata snapshot.

Only paths, sizes and modification timestamps are stored. Note content is never copied to addon storage.

# Tag Index

An original tag-report workflow inspired by tag-management plugins in linked-note applications.

It reads:

- `tags:` and `tag:` frontmatter values;
- YAML arrays and list-style tag declarations;
- inline `#tags`, excluding headings, fenced code and inline code.

The generated `Reports/Tag Index.md` lists tag counts, source notes and case/spelling variants such as `Project`, `project` and `PROJECT`.

The addon is read-only except for its generated report. It does not rename tags automatically.

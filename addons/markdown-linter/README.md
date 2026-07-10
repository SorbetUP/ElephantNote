# Markdown Linter

An original Markdown quality workflow inspired by formatter and linter plugins in popular note applications.

It exposes two distinct commands:

1. **Audit Markdown formatting** only writes `Reports/Markdown Lint.md`.
2. **Apply safe Markdown fixes** explicitly modifies affected notes and then writes the same report.

The conservative automatic fixes are limited to:

- normalizing line endings to LF;
- removing trailing spaces and tabs;
- collapsing runs larger than two blank lines;
- adding one final newline.

Malformed headings and multiple H1 headings are reported but never rewritten automatically.

Because the second command can update arbitrary visible Markdown notes, this addon declares whole-vault write permission. Review the generated audit before using the apply command.

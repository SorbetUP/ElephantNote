# Inbox Digest

Builds `Reports/Inbox Digest.md` from Markdown notes stored under `Inbox/`.

The addon:

- lists only notes allowed by the `Inbox/**` read permission;
- ignores notes larger than 256 KiB;
- reads at most 50 recent notes;
- extracts a title, status, short summary and unchecked-task count;
- never modifies source notes;
- stores only run metadata in private addon storage.

The generated report provides a review queue and a suggested processing flow.

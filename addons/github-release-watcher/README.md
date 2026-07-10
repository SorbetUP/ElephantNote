# GitHub Release Watcher

Tracks the latest release for repositories listed in `GitHub Releases/config.json` and generates `GitHub Releases/Release Dashboard.md`.

The first run creates a configuration template. Later runs:

- fetch the latest public GitHub release for up to 25 repositories;
- create one release note per repository;
- report newly observed release tags;
- retain the last valid result when GitHub is temporarily unavailable.

No GitHub token is required, so public unauthenticated API rate limits apply.

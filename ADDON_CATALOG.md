# ElephantNote Addon Catalogue

This branch is the official source catalogue consumed by ElephantNote.

Only files declared in `catalog.json` are exposed in **Settings → Addons**. Each addon lives under `addons/<slug>/` and must contain:

```text
manifest.json
main.js
README.md
```

ElephantNote downloads the manifest and JavaScript entry through its Rust backend, validates the catalogue paths and addon manifest, creates a standard `.enaddon` archive locally, and installs it into the active vault under `.elephantnote/addons`.

Adding an addon requires a review of its source, permissions and catalogue metadata. Updating an addon requires incrementing its manifest and catalogue versions together.

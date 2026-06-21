# ElephantNote Android

Native Android companion for ElephantNote.

Implemented:

- offline Markdown note capture and local vault storage
- mobile Markdown toolbar for headings, emphasis, tasks, wiki links, code, quotes, tags and folders
- native Markdown preview for headings, lists, tasks, quotes, code and image references
- tag extraction, local search, clickable wiki topics and graph statistics
- logical vault folders through `folder: Name`
- note editing, backlinks with `[[Note Title]]`, and vault word counts
- offline source ingestion from URLs into source notes
- editable local calendar events plus recent note activity
- touch canvas sketches with local persistence
- local task runner for mobile daily briefings
- model and sync status surfaces aligned with the desktop feature map
- configurable model slots, local AI visibility and sync remote metadata
- Android share sheet receiver for `text/*`, `image/*` and multiple images
- shared image attachments copied into app-private storage
- local attachment browser with URI copy, note creation and deletion
- Markdown import/export through the clipboard and Android file picker
- no network requirement

Build prerequisite: Android SDK with platform 34 and Gradle/Android Gradle Plugin available.

```bash
gradle -p android assembleDebug
gradle -p android assembleRelease
```

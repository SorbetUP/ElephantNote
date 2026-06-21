# ElephantNote Android

Native Android companion for ElephantNote.

This is not an Electron port. Electron cannot run as the Android runtime, so the Android app keeps a native mobile shell while sharing the same practical data model wherever possible: Markdown notes, folders, tags, backlinks, attachments, import/export, and desktop handoff. Local AI execution is intentionally out of scope for Android for now; the desktop app can run AI locally and sync the resulting Markdown/state back to the phone.

## Implemented

- offline Markdown note capture
- note editing and deletion
- real local Markdown files under the app-specific `ElephantVault/Notes` directory
- folder mapping through `folder: Name` metadata and matching vault folders
- Markdown toolbar for headings, emphasis, tasks, wiki links, code, quotes, tags and folders
- native Markdown preview for headings, lists, tasks, quotes, code blocks and image references
- tag extraction, local search, clickable wiki topics and graph statistics
- backlinks from `[[Note Title]]` references
- offline source ingestion from URLs into source notes
- editable local calendar events plus recent note activity
- touch canvas sketches with local persistence
- local task runner for mobile daily briefings
- sync metadata surfaces for desktop handoff
- Android share sheet receiver for `text/*`, `image/*` and multiple images
- shared image attachments copied into `ElephantVault/Attachments`
- local attachment browser with URI copy, note creation and deletion
- Markdown import/export through the clipboard and Android file picker
- no network requirement

## Current architecture

The app stores user-facing note content as Markdown files, not as a single SharedPreferences JSON blob. This makes the Android side much closer to the desktop vault model and makes later Syncthing/rclone/WebDAV integration safer.

Default local structure:

```text
ElephantVault/
  Notes/
    Mobile Inbox/
      Example.md
  Attachments/
    attachment-....jpg
  Canvas/
    drawings.json
  .elephantnote/
    mobile-vault.json
    mobile-calendar.json
    mobile-sources.json
```

Notes, attachments, source metadata, calendar metadata and canvas metadata are now vault-backed. Settings, model slots and sync identity remain lightweight app settings because they are device-specific rather than note content.

## Not implemented on Android yet

- local LLM/OCR execution on the phone
- `node-llama-cpp`
- Electron IPC
- MarkText engine embedding
- advanced Excalidraw desktop file parity
- full automatic rclone/Syncthing runner inside the APK

The intended workflow is: capture and organize on phone, run heavy AI/OCR on desktop, then sync generated Markdown/results back to Android.

## Build

Build prerequisite: Android SDK with platform 34 and Android Gradle Plugin available.

```bash
gradle -p android assembleDebug
gradle -p android assembleRelease
```

Generated files under `.gradle/`, `build/`, APKs and Android IDE metadata must not be committed.

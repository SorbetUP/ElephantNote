# Android parity manifest

folder: Guides
#android #parity #release

This release is a native Android implementation of the mobile-compatible parts
of ElephantNote. It is not a zipped Electron desktop app. Android gets dedicated
storage, UI and lifecycle behavior while preserving vault concepts.

## Included in the APK

- Native launcher activity and Android share receiver.
- Offline vault storage using app-private preferences.
- Markdown notes with local clipboard and file import/export.
- Mobile Markdown toolbar for headings, bold, italic, tasks, wiki links, code, quotes, tags and folders.
- Native Markdown preview for note details.
- Folder inference through Markdown metadata.
- Tag extraction, tag counts and clickable wiki topics.
- Search across local vault content.
- Backlink parsing for `[[Wiki Links]]`.
- Graph summary for notes, tags and backlinks.
- Topic drill-down from Wiki and Graph into linked notes.
- Shared text, single image and multiple image capture.
- Shared images copied into app-private attachment storage.
- Attachment browser with file URI copy, generated notes and deletion.
- Source URL ingestion and generated source notes.
- Calendar event storage.
- Canvas drawing activity with persisted strokes.
- Model slot settings for embedding, chat and OCR roles.
- Local AI visibility setting.
- Sync device id, folder id and remote path configuration.
- Bundled starter guides and reusable templates.

## Still desktop-specific

- Electron IPC.
- Full MarkText editor engine.
- Node-based local model runtimes.
- Desktop OCR execution.
- Excalidraw file compatibility.
- Native filesystem vault browsing.
- Background sync daemons.

Those features require Android-specific runtimes or permissions before they can
be called complete. The current APK is a real signed release build with the
mobile feature set included and visible in-app.

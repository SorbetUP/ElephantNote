package com.elephantnote.mobile;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class AssetLibrary {
    static final class Entry {
        final String fileName;
        final String title;
        final String summary;

        Entry(String fileName, String title, String summary) {
            this.fileName = fileName;
            this.title = title;
            this.summary = summary;
        }
    }

    private static final Entry[] ENTRIES = {
        new Entry("elephantnote/welcome.md", "Welcome to ElephantNote Android", "Offline vault, Markdown capture, folders, tags, backlinks and sync export."),
        new Entry("elephantnote/mobile-workflow.md", "Mobile workflow", "Daily capture, sources, calendar events, graph review and desktop handoff."),
        new Entry("elephantnote/android-vault.md", "Android local vault", "Markdown file storage, attachment layout and desktop handoff."),
        new Entry("elephantnote/templates.md", "Templates", "Reusable Markdown templates for meetings, sources, decisions and daily briefings."),
        new Entry("elephantnote/parity-manifest.md", "Parity manifest", "Feature coverage included in this native Android release.")
    };

    private final Context context;

    AssetLibrary(Context context) {
        this.context = context.getApplicationContext();
    }

    Entry[] entries() {
        return ENTRIES.clone();
    }

    String read(Entry entry) {
        try (InputStream input = context.getAssets().open(entry.fileName)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception error) {
            return "# " + entry.title + "\n\nThis bundled guide could not be loaded.";
        }
    }

    int bundledDocumentationCount() {
        return entries().length;
    }
}

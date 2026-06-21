package com.elephantnote.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final int REQUEST_IMPORT_MARKDOWN = 101;
    private static final int REQUEST_EXPORT_MARKDOWN = 102;
    private static final int COLOR_INK = Color.rgb(31, 41, 55);
    private static final int COLOR_MUTED = Color.rgb(91, 104, 124);
    private static final int COLOR_LINE = Color.rgb(221, 226, 234);
    private static final int COLOR_ACCENT = Color.rgb(37, 99, 235);

    private NoteStore store;
    private CalendarStore calendarStore;
    private DrawingStore drawingStore;
    private SourceStore sourceStore;
    private AttachmentStore attachmentStore;
    private AssetLibrary assetLibrary;
    private SyncState syncState;
    private AppSettings settings;
    private LinearLayout content;
    private String activeSection = "notes";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new NoteStore(this);
        calendarStore = new CalendarStore(this);
        drawingStore = new DrawingStore(this);
        sourceStore = new SourceStore(this);
        attachmentStore = new AttachmentStore(this);
        assetLibrary = new AssetLibrary(this);
        syncState = SyncState.load(this);
        settings = AppSettings.load(this);
        renderShell();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (content != null && "canvas".equals(activeSection)) renderShell();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == REQUEST_IMPORT_MARKDOWN) {
            int imported = store.importMarkdown(readText(uri));
            toast("Imported " + imported + " note" + (imported == 1 ? "" : "s"));
            activeSection = "notes";
            renderShell();
        } else if (requestCode == REQUEST_EXPORT_MARKDOWN) {
            writeText(uri, store.exportMarkdown());
            toast("Markdown export written");
        }
    }

    private void renderShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(248, 250, 252));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(18), dp(16), dp(18), dp(8));
        header.setBackgroundColor(Color.WHITE);
        root.addView(header);

        TextView title = text("ElephantNote", 25, COLOR_INK, true);
        header.addView(title);
        header.addView(text("Offline vault - " + syncState.deviceId, 13, COLOR_MUTED, false));

        HorizontalScrollView navScroll = new HorizontalScrollView(this);
        navScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(12), dp(8), dp(12), dp(8));
        navScroll.addView(nav);
        root.addView(navScroll);

        String[] labels = {"Notes", "Vault", "Search", "Sources", "Files", "Calendar", "Canvas", "Graph", "Wiki", "Guide", "Models", "Tasks", "Sync", "Settings"};
        String[] ids = {"notes", "vault", "search", "sources", "files", "calendar", "canvas", "graph", "wiki", "guide", "models", "tasks", "sync", "settings"};
        for (int index = 0; index < ids.length; index += 1) {
            String section = ids[index];
            Button button = new Button(this);
            button.setText(labels[index]);
            button.setAllCaps(false);
            button.setTextColor(section.equals(activeSection) ? Color.WHITE : COLOR_INK);
            button.setBackgroundColor(section.equals(activeSection) ? COLOR_ACCENT : Color.WHITE);
            button.setOnClickListener(view -> {
                activeSection = section;
                renderShell();
            });
            nav.addView(button, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44)));
        }

        ScrollView scrollView = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(12), dp(18), dp(24));
        scrollView.addView(content);
        root.addView(scrollView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1
        ));

        setContentView(root);
        renderActiveSection();
    }

    private void renderActiveSection() {
        content.removeAllViews();
        if ("notes".equals(activeSection)) renderNotes();
        else if ("vault".equals(activeSection)) renderVault();
        else if ("search".equals(activeSection)) renderSearch();
        else if ("sources".equals(activeSection)) renderSources();
        else if ("files".equals(activeSection)) renderFiles();
        else if ("calendar".equals(activeSection)) renderCalendar();
        else if ("canvas".equals(activeSection)) renderCanvas();
        else if ("graph".equals(activeSection)) renderGraph();
        else if ("wiki".equals(activeSection)) renderWiki();
        else if ("guide".equals(activeSection)) renderGuide();
        else if ("models".equals(activeSection)) renderModels();
        else if ("tasks".equals(activeSection)) renderTasks();
        else if ("sync".equals(activeSection)) renderSync();
        else renderSettings();
    }

    private void renderNotes() {
        content.addView(sectionTitle("Quick capture"));
        EditText body = editor("Markdown note, #tags supported");
        content.addView(body);
        content.addView(markdownToolbar(body));

        Button save = primaryButton("Save offline note");
        save.setOnClickListener(view -> {
            String value = body.getText().toString();
            if (value.trim().isEmpty()) {
                toast("Nothing to save");
                return;
            }
            store.create("", value);
            toast("Saved");
            renderShell();
        });
        content.addView(save);

        content.addView(sectionTitle("Recent notes"));
        addNoteList(store.list(), true);
    }

    private void renderVault() {
        content.addView(sectionTitle("Vault"));
        NoteStore.GraphSummary summary = store.graphSummary();
        content.addView(card("Stats", summary.notes + " notes\n" + store.totalWords() + " words\n" + summary.tags + " tags"));
        content.addView(bodyText("Use a line like folder: Projects to place a note in a mobile vault folder."));
        List<String> folders = store.folders();
        if (folders.isEmpty()) {
            content.addView(empty("No folders yet."));
            return;
        }
        for (String folder : folders) {
            List<NoteStore.Note> notes = store.listByFolder(folder);
            content.addView(card(folder, notes.size() + " notes"));
            for (NoteStore.Note note : notes) content.addView(noteCard(note, true));
        }
    }

    private void renderSearch() {
        content.addView(sectionTitle("Search vault"));
        EditText query = singleLine("Search title, body, or tags");
        content.addView(query);
        LinearLayout results = vertical();
        content.addView(results);

        Button run = primaryButton("Search");
        run.setOnClickListener(view -> {
            results.removeAllViews();
            List<NoteStore.Note> notes = store.search(query.getText().toString());
            if (notes.isEmpty()) results.addView(empty("No matching local note."));
            for (NoteStore.Note note : notes) results.addView(noteCard(note, false));
        });
        content.addView(run);
        addNoteList(store.list(), false);
    }

    private void renderCalendar() {
        content.addView(sectionTitle("Calendar"));
        EditText title = singleLine("Event title");
        EditText when = singleLine("Date or time");
        EditText notes = editor("Event notes");
        content.addView(title);
        content.addView(when);
        content.addView(notes);
        Button add = primaryButton("Add calendar event");
        add.setOnClickListener(view -> {
            calendarStore.create(title.getText().toString(), when.getText().toString(), notes.getText().toString());
            toast("Event added");
            renderShell();
        });
        content.addView(add);

        content.addView(sectionTitle("Events"));
        for (CalendarStore.Event event : calendarStore.list()) {
            LinearLayout box = verticalCard();
            box.addView(text(event.title, 17, COLOR_INK, true));
            box.addView(text(event.when, 14, COLOR_ACCENT, false));
            box.addView(text(event.notes, 14, COLOR_MUTED, false));
            Button delete = secondaryButton("Delete event");
            delete.setOnClickListener(view -> {
                calendarStore.delete(event.id);
                toast("Event deleted");
                renderShell();
            });
            box.addView(delete);
            content.addView(box);
        }

        content.addView(sectionTitle("Recent note activity"));
        for (NoteStore.Note note : store.list()) {
            content.addView(card(
                DateFormat.getDateTimeInstance().format(new Date(note.updatedAt)),
                note.folder + " / " + note.title + "\n" + note.tagsLabel()
            ));
        }
    }

    private void renderSources() {
        content.addView(sectionTitle("Sources"));
        EditText title = singleLine("Source title");
        EditText url = singleLine("URL");
        content.addView(title);
        content.addView(url);
        Button add = primaryButton("Ingest URL as note");
        add.setOnClickListener(view -> {
            String sourceTitle = title.getText().toString().trim();
            String sourceUrl = url.getText().toString().trim();
            if (sourceUrl.isEmpty()) {
                toast("URL required");
                return;
            }
            SourceStore.Source source = sourceStore.create(sourceTitle, sourceUrl);
            store.create(source.title, "folder: Sources\n#source\n\n[" + source.title + "](" + source.url + ")\n\nImported on Android.");
            toast("Source saved");
            renderShell();
        });
        content.addView(add);

        for (SourceStore.Source source : sourceStore.list()) {
            LinearLayout box = verticalCard();
            box.addView(text(source.title, 17, COLOR_INK, true));
            box.addView(text(source.url, 14, COLOR_ACCENT, false));
            Button delete = secondaryButton("Delete source");
            delete.setOnClickListener(view -> {
                sourceStore.delete(source.id);
                toast("Source deleted");
                renderShell();
            });
            box.addView(delete);
            content.addView(box);
        }
        if (sourceStore.list().isEmpty()) content.addView(empty("No sources saved."));
    }

    private void renderFiles() {
        content.addView(sectionTitle("Attachments"));
        List<AttachmentStore.Attachment> attachments = attachmentStore.list();
        content.addView(card("Local files", attachments.size() + " attachments\n" + formatBytes(attachmentStore.totalBytes()) + " stored privately on this device"));
        if (attachments.isEmpty()) {
            content.addView(empty("Share images to ElephantNote to create persistent local attachments."));
            return;
        }
        for (AttachmentStore.Attachment attachment : attachments) {
            LinearLayout box = verticalCard();
            box.addView(text(attachment.name, 17, COLOR_INK, true));
            box.addView(text(formatBytes(attachment.size), 14, COLOR_MUTED, false));
            box.addView(text(DateFormat.getDateTimeInstance().format(new Date(attachment.updatedAt)), 12, COLOR_MUTED, false));
            Button copy = secondaryButton("Copy file URI");
            copy.setOnClickListener(view -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText(attachment.name, attachment.uri));
                toast("Attachment URI copied");
            });
            Button note = primaryButton("Create attachment note");
            note.setOnClickListener(view -> {
                store.create(attachment.name, "folder: Attachments\n#attachment\n\n![](" + attachment.uri + ")\n");
                toast("Attachment note created");
                activeSection = "notes";
                renderShell();
            });
            Button delete = secondaryButton("Delete file");
            delete.setOnClickListener(view -> {
                if (attachmentStore.delete(attachment.name)) toast("Attachment deleted");
                else toast("Unable to delete attachment");
                renderShell();
            });
            box.addView(copy);
            box.addView(note);
            box.addView(delete);
            content.addView(box);
        }
    }

    private void renderCanvas() {
        content.addView(sectionTitle("Canvas"));
        Button create = primaryButton("New canvas");
        create.setOnClickListener(view -> startActivity(new Intent(this, SketchActivity.class)));
        content.addView(create);

        for (DrawingStore.Drawing drawing : drawingStore.list()) {
            LinearLayout box = verticalCard();
            box.addView(text(drawing.title, 17, COLOR_INK, true));
            box.addView(text(drawing.strokeCount() + " strokes", 14, COLOR_MUTED, false));
            box.addView(text(DateFormat.getDateTimeInstance().format(new Date(drawing.updatedAt)), 12, COLOR_MUTED, false));
            Button open = primaryButton("Open canvas");
            open.setOnClickListener(view -> {
                Intent intent = new Intent(this, SketchActivity.class);
                intent.putExtra(SketchActivity.EXTRA_DRAWING_ID, drawing.id);
                startActivity(intent);
            });
            Button delete = secondaryButton("Delete canvas");
            delete.setOnClickListener(view -> {
                drawingStore.delete(drawing.id);
                toast("Canvas deleted");
                renderShell();
            });
            box.addView(open);
            box.addView(delete);
            content.addView(box);
        }
        if (drawingStore.list().isEmpty()) content.addView(empty("No canvases yet."));
    }

    private void renderGraph() {
        NoteStore.GraphSummary summary = store.graphSummary();
        content.addView(sectionTitle("Semantic graph"));
        content.addView(card("Vault graph", summary.notes + " notes\n" + summary.tags + " tag nodes\n" + summary.links + " note-tag links\n" + summary.backlinks + " backlinks"));
        for (Map.Entry<String, Integer> entry : store.tagCounts().entrySet()) {
            View tagCard = card("#" + entry.getKey(), entry.getValue() + " linked notes\nTap to open topic notes.");
            tagCard.setOnClickListener(view -> showTagTopic(entry.getKey()));
            content.addView(tagCard);
        }
        for (NoteStore.Backlink link : store.backlinks()) {
            content.addView(card("[[" + link.targetTitle + "]]", "Linked from " + link.sourceTitle));
        }
        if (summary.notes == 0) content.addView(empty("Create tagged notes to populate the graph."));
    }

    private void renderWiki() {
        content.addView(sectionTitle("Wiki"));
        Map<String, Integer> counts = store.tagCounts();
        if (counts.isEmpty()) {
            content.addView(empty("Tags become local wiki topics."));
            return;
        }
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            View topicCard = card("Topic: " + entry.getKey(), "Built from " + entry.getValue() + " local note citations.\nTap to inspect linked notes.");
            topicCard.setOnClickListener(view -> showTagTopic(entry.getKey()));
            content.addView(topicCard);
        }
    }

    private void renderGuide() {
        content.addView(sectionTitle("Bundled guide"));
        content.addView(card("Release content", "This APK includes starter guides, workflow notes, Markdown templates, a parity manifest and " + assetLibrary.bundledDocumentationCount() + " documentation files in Android assets."));
        Button install = primaryButton("Install starter notes");
        install.setOnClickListener(view -> {
            int imported = 0;
            for (AssetLibrary.Entry entry : assetLibrary.entries()) {
                store.create(entry.title, assetLibrary.read(entry));
                imported += 1;
            }
            toast("Installed " + imported + " guide notes");
            activeSection = "notes";
            renderShell();
        });
        content.addView(install);

        for (AssetLibrary.Entry entry : assetLibrary.entries()) {
            LinearLayout box = verticalCard();
            box.addView(text(entry.title, 17, COLOR_INK, true));
            box.addView(text(entry.summary, 14, COLOR_MUTED, false));
            Button open = secondaryButton("Preview");
            open.setOnClickListener(view -> showGuide(entry));
            box.addView(open);
            content.addView(box);
        }
    }

    private void renderModels() {
        content.addView(sectionTitle("Local AI and models"));
        content.addView(card("Embedding", settings.embeddingModel));
        content.addView(card("Chat", settings.chatModel));
        content.addView(card("OCR", settings.ocrModel));
        content.addView(card("Runtime", "Local AI " + (settings.localAiEnabled ? "enabled" : "disabled") + "\nModel library " + (settings.showModelLibrary ? "visible" : "hidden")));
        Button edit = primaryButton("Edit model slots");
        edit.setOnClickListener(view -> showModelSettings());
        content.addView(edit);
    }

    private void renderSync() {
        content.addView(sectionTitle("Sync"));
        content.addView(card("Device identity", syncState.deviceId + "\nFolder: " + syncState.folderId + "\nRemote: " + (syncState.remote.isEmpty() ? "not configured" : syncState.remote)));
        content.addView(card("Transport", "Offline-first local storage\nDesktop-compatible Markdown export\nSyncthing/Git identity shape preserved"));
        Button configure = primaryButton("Configure sync");
        configure.setOnClickListener(view -> showSyncSettings());
        content.addView(configure);
        Button importMarkdown = secondaryButton("Import Markdown from clipboard");
        importMarkdown.setOnClickListener(view -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null || !clipboard.hasPrimaryClip() || clipboard.getPrimaryClip().getItemCount() == 0) {
                toast("Clipboard is empty");
                return;
            }
            CharSequence text = clipboard.getPrimaryClip().getItemAt(0).coerceToText(this);
            int imported = store.importMarkdown(text == null ? "" : text.toString());
            toast("Imported " + imported + " note" + (imported == 1 ? "" : "s"));
            activeSection = "notes";
            renderShell();
        });
        content.addView(importMarkdown);
        Button importFile = secondaryButton("Import Markdown file");
        importFile.setOnClickListener(view -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/*");
            startActivityForResult(intent, REQUEST_IMPORT_MARKDOWN);
        });
        content.addView(importFile);
        Button export = primaryButton("Copy Markdown export");
        export.setOnClickListener(view -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("ElephantNote Markdown Export", store.exportMarkdown()));
            toast("Markdown copied");
        });
        content.addView(export);
        Button exportFile = primaryButton("Export Markdown file");
        exportFile.setOnClickListener(view -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/markdown");
            intent.putExtra(Intent.EXTRA_TITLE, "elephantnote-mobile-export.md");
            startActivityForResult(intent, REQUEST_EXPORT_MARKDOWN);
        });
        content.addView(exportFile);
    }

    private void renderTasks() {
        content.addView(sectionTitle("Tasks"));
        content.addView(card("Daily briefing", "Create a local summary note from vault stats, calendar events and source counts."));
        Button briefing = primaryButton("Run daily briefing");
        briefing.setOnClickListener(view -> {
            NoteStore.GraphSummary summary = store.graphSummary();
            String body =
                "folder: Briefings\n#briefing\n\n" +
                "# Mobile briefing\n\n" +
                "- Notes: " + summary.notes + "\n" +
                "- Words: " + store.totalWords() + "\n" +
                "- Tags: " + summary.tags + "\n" +
                "- Backlinks: " + summary.backlinks + "\n" +
                "- Calendar events: " + calendarStore.list().size() + "\n" +
                "- Sources: " + sourceStore.list().size() + "\n";
            store.create("Mobile briefing", body);
            toast("Briefing created");
            activeSection = "notes";
            renderShell();
        });
        content.addView(briefing);

        content.addView(card("Autotag", "Android extracts #tags on save and update. Desktop AI autotag can refine these after sync/export."));
        content.addView(card("Wiki proposal", "Tags and backlinks generate local wiki topics in the Wiki and Graph tabs."));
    }

    private void renderSettings() {
        content.addView(sectionTitle("Settings"));
        content.addView(card("Workspace", "Vault folder: " + syncState.folderId + "\nNotes: " + store.list().size() + "\nWords: " + store.totalWords()));
        content.addView(card("Feature parity", "Notes, vault folders, search, sources, calendar, canvas, graph, wiki topics, bundled guide, model slots, sync identity, import and export are available in this native build."));
        content.addView(card("Desktop-only runtime gaps", "Advanced Excalidraw files, OCR execution, node-llama-cpp inference, Electron IPC, and MarkText engine embedding still need Android-specific runtimes."));
        Button localAi = secondaryButton(settings.localAiEnabled ? "Disable local AI slots" : "Enable local AI slots");
        localAi.setOnClickListener(view -> {
            settings = settings.saveLocalAi(!settings.localAiEnabled, settings.showModelLibrary);
            renderShell();
        });
        content.addView(localAi);
    }

    private void addNoteList(List<NoteStore.Note> notes, boolean allowDelete) {
        if (notes.isEmpty()) {
            content.addView(empty("No local notes yet."));
            return;
        }
        for (NoteStore.Note note : notes) content.addView(noteCard(note, allowDelete));
    }

    private View noteCard(NoteStore.Note note, boolean allowDelete) {
        LinearLayout box = verticalCard();
        box.addView(text(note.title, 18, COLOR_INK, true));
        box.addView(text(note.folder, 12, COLOR_MUTED, false));
        box.addView(text(note.preview(), 14, COLOR_MUTED, false));
        box.addView(text(note.tagsLabel(), 13, COLOR_ACCENT, false));
        box.addView(text(DateFormat.getDateTimeInstance().format(new Date(note.updatedAt)), 12, COLOR_MUTED, false));
        box.setOnClickListener(view -> showNote(note));
        if (allowDelete) {
            Button delete = secondaryButton("Delete");
            delete.setOnClickListener(view -> {
                store.delete(note.id);
                toast("Deleted");
                renderShell();
            });
            box.addView(delete);
        }
        return box;
    }

    private void showNote(NoteStore.Note note) {
        ScrollView scroll = new ScrollView(this);
        scroll.addView(markdownPreview(note.body));
        new AlertDialog.Builder(this)
            .setTitle(note.title)
            .setView(scroll)
            .setPositiveButton("Edit", (dialog, which) -> showEditor(note))
            .setNegativeButton("Copy", (dialog, which) -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText(note.title, note.body));
                toast("Copied");
            })
            .setNeutralButton("Close", null)
            .show();
    }

    private void showEditor(NoteStore.Note note) {
        LinearLayout form = vertical();
        form.setPadding(dp(16), dp(8), dp(16), 0);
        EditText title = singleLine("Title");
        title.setText(note.title);
        EditText body = editor("Markdown body");
        body.setText(note.body);
        form.addView(title);
        form.addView(body);
        form.addView(markdownToolbar(body));

        new AlertDialog.Builder(this)
            .setTitle("Edit note")
            .setView(form)
            .setPositiveButton("Save", (dialog, which) -> {
                store.update(note.id, title.getText().toString(), body.getText().toString());
                toast("Updated");
                renderShell();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void showGuide(AssetLibrary.Entry entry) {
        new AlertDialog.Builder(this)
            .setTitle(entry.title)
            .setMessage(assetLibrary.read(entry))
            .setPositiveButton("Install as note", (dialog, which) -> {
                store.create(entry.title, assetLibrary.read(entry));
                toast("Guide note installed");
                activeSection = "notes";
                renderShell();
            })
            .setNegativeButton("Close", null)
            .show();
    }

    private void showTagTopic(String tag) {
        LinearLayout layout = vertical();
        layout.setPadding(dp(16), dp(8), dp(16), dp(8));
        List<NoteStore.Note> notes = store.listByTag(tag);
        layout.addView(text(notes.size() + " linked note" + (notes.size() == 1 ? "" : "s"), 14, COLOR_MUTED, false));
        for (NoteStore.Note note : notes) {
            LinearLayout box = verticalCard();
            box.addView(text(note.title, 17, COLOR_INK, true));
            box.addView(text(note.folder, 12, COLOR_MUTED, false));
            box.addView(text(note.preview(), 14, COLOR_MUTED, false));
            box.setOnClickListener(view -> showNote(note));
            layout.addView(box);
        }
        if (notes.isEmpty()) layout.addView(empty("No notes for this topic."));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);
        new AlertDialog.Builder(this)
            .setTitle("#" + tag)
            .setView(scroll)
            .setPositiveButton("Close", null)
            .show();
    }

    private void showModelSettings() {
        LinearLayout form = vertical();
        form.setPadding(dp(16), dp(8), dp(16), 0);
        EditText embedding = singleLine("Embedding model");
        embedding.setText(settings.embeddingModel);
        EditText chat = singleLine("Chat model");
        chat.setText(settings.chatModel);
        EditText ocr = singleLine("OCR model");
        ocr.setText(settings.ocrModel);
        CheckBox modelLibrary = new CheckBox(this);
        modelLibrary.setText("Show model library");
        modelLibrary.setChecked(settings.showModelLibrary);
        form.addView(embedding);
        form.addView(chat);
        form.addView(ocr);
        form.addView(modelLibrary);

        new AlertDialog.Builder(this)
            .setTitle("Model slots")
            .setView(form)
            .setPositiveButton("Save", (dialog, which) -> {
                settings = settings
                    .saveModels(embedding.getText().toString(), chat.getText().toString(), ocr.getText().toString())
                    .saveLocalAi(settings.localAiEnabled, modelLibrary.isChecked());
                toast("Models updated");
                renderShell();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void showSyncSettings() {
        LinearLayout form = vertical();
        form.setPadding(dp(16), dp(8), dp(16), 0);
        EditText folder = singleLine("Folder id");
        folder.setText(syncState.folderId);
        EditText remote = singleLine("Remote path");
        remote.setText(syncState.remote);
        form.addView(folder);
        form.addView(remote);

        new AlertDialog.Builder(this)
            .setTitle("Sync settings")
            .setView(form)
            .setPositiveButton("Save", (dialog, which) -> {
                syncState = syncState.save(folder.getText().toString(), remote.getText().toString());
                toast("Sync updated");
                renderShell();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private TextView sectionTitle(String value) {
        TextView title = text(value, 20, COLOR_INK, true);
        title.setPadding(0, dp(10), 0, dp(8));
        return title;
    }

    private TextView bodyText(String value) {
        TextView text = text(value, 14, COLOR_MUTED, false);
        text.setPadding(0, 0, 0, dp(10));
        return text;
    }

    private TextView empty(String value) {
        TextView text = text(value, 15, COLOR_MUTED, false);
        text.setGravity(Gravity.CENTER);
        text.setPadding(dp(18), dp(28), dp(18), dp(28));
        return text;
    }

    private View card(String title, String body) {
        LinearLayout box = verticalCard();
        box.addView(text(title, 17, COLOR_INK, true));
        box.addView(text(body, 14, COLOR_MUTED, false));
        return box;
    }

    private LinearLayout markdownPreview(String markdown) {
        LinearLayout preview = vertical();
        preview.setPadding(dp(16), dp(8), dp(16), dp(8));
        String[] lines = (markdown == null ? "" : markdown).split("\\R", -1);
        boolean inFence = false;
        StringBuilder paragraph = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("```")) {
                flushParagraph(preview, paragraph);
                inFence = !inFence;
                continue;
            }
            if (inFence) {
                TextView code = text(line, 13, Color.rgb(15, 23, 42), false);
                code.setTypeface(android.graphics.Typeface.MONOSPACE);
                code.setBackgroundColor(Color.rgb(226, 232, 240));
                code.setPadding(dp(10), dp(6), dp(10), dp(6));
                preview.addView(code);
                continue;
            }
            if (trimmed.isEmpty()) {
                flushParagraph(preview, paragraph);
                continue;
            }
            if (trimmed.toLowerCase().startsWith("folder:")) {
                flushParagraph(preview, paragraph);
                preview.addView(text(trimmed, 13, COLOR_ACCENT, true));
            } else if (trimmed.startsWith("# ")) {
                flushParagraph(preview, paragraph);
                preview.addView(text(trimmed.substring(2), 22, COLOR_INK, true));
            } else if (trimmed.startsWith("## ")) {
                flushParagraph(preview, paragraph);
                preview.addView(text(trimmed.substring(3), 19, COLOR_INK, true));
            } else if (trimmed.startsWith("### ")) {
                flushParagraph(preview, paragraph);
                preview.addView(text(trimmed.substring(4), 17, COLOR_INK, true));
            } else if (trimmed.startsWith("> ")) {
                flushParagraph(preview, paragraph);
                TextView quote = text(trimmed.substring(2), 15, COLOR_MUTED, false);
                quote.setPadding(dp(12), dp(6), dp(8), dp(6));
                quote.setBackgroundColor(Color.rgb(241, 245, 249));
                preview.addView(quote);
            } else if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
                flushParagraph(preview, paragraph);
                preview.addView(text((trimmed.startsWith("- [ ] ") ? "[ ] " : "[x] ") + inlineMarkdown(trimmed.substring(6)), 15, COLOR_INK, false));
            } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                flushParagraph(preview, paragraph);
                preview.addView(text("- " + inlineMarkdown(trimmed.substring(2)), 15, COLOR_INK, false));
            } else if (trimmed.matches("\\d+\\.\\s+.*")) {
                flushParagraph(preview, paragraph);
                preview.addView(text(inlineMarkdown(trimmed), 15, COLOR_INK, false));
            } else if (trimmed.startsWith("![](") || trimmed.startsWith("![")) {
                flushParagraph(preview, paragraph);
                preview.addView(text("Image: " + trimmed, 14, COLOR_ACCENT, false));
            } else {
                if (paragraph.length() > 0) paragraph.append('\n');
                paragraph.append(inlineMarkdown(line));
            }
        }
        flushParagraph(preview, paragraph);
        if (preview.getChildCount() == 0) preview.addView(empty("Empty note."));
        return preview;
    }

    private void flushParagraph(LinearLayout preview, StringBuilder paragraph) {
        if (paragraph.length() == 0) return;
        preview.addView(text(paragraph.toString(), 15, COLOR_INK, false));
        paragraph.setLength(0);
    }

    private String inlineMarkdown(String value) {
        return value
            .replace("**", "")
            .replace("__", "")
            .replace("`", "")
            .replace("[[", "")
            .replace("]]", "");
    }

    private LinearLayout vertical() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout verticalCard() {
        LinearLayout box = vertical();
        box.setPadding(dp(14), dp(12), dp(14), dp(12));
        box.setBackgroundColor(Color.WHITE);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(10));
        box.setLayoutParams(params);
        return box;
    }

    private EditText editor(String hint) {
        EditText editText = new EditText(this);
        editText.setHint(hint);
        editText.setMinLines(5);
        editText.setTextColor(COLOR_INK);
        editText.setHintTextColor(COLOR_MUTED);
        return editText;
    }

    private View markdownToolbar(EditText target) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        scroll.addView(bar);

        addMarkdownButton(bar, "H1", target, "# ", "");
        addMarkdownButton(bar, "Bold", target, "**", "**");
        addMarkdownButton(bar, "Italic", target, "_", "_");
        addMarkdownButton(bar, "Task", target, "- [ ] ", "");
        addMarkdownButton(bar, "Wiki", target, "[[", "]]");
        addMarkdownButton(bar, "Code", target, "`", "`");
        addMarkdownButton(bar, "Quote", target, "> ", "");
        addMarkdownButton(bar, "Tag", target, "#", "");
        addMarkdownButton(bar, "Folder", target, "folder: ", "\n");
        return scroll;
    }

    private void addMarkdownButton(LinearLayout bar, String label, EditText target, String prefix, String suffix) {
        Button button = secondaryButton(label);
        button.setOnClickListener(view -> insertMarkdown(target, prefix, suffix));
        bar.addView(button, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(42)));
    }

    private void insertMarkdown(EditText target, String prefix, String suffix) {
        int start = Math.max(0, target.getSelectionStart());
        int end = Math.max(0, target.getSelectionEnd());
        if (end < start) {
            int swap = start;
            start = end;
            end = swap;
        }
        String current = target.getText().toString();
        String selected = current.substring(start, end);
        String replacement = prefix + selected + suffix;
        target.getText().replace(start, end, replacement);
        int cursor = selected.isEmpty() ? start + prefix.length() : start + replacement.length();
        target.setSelection(Math.min(cursor, target.getText().length()));
    }

    private EditText singleLine(String hint) {
        EditText editText = new EditText(this);
        editText.setHint(hint);
        editText.setSingleLine(true);
        editText.setTextColor(COLOR_INK);
        editText.setHintTextColor(COLOR_MUTED);
        return editText;
    }

    private Button primaryButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(COLOR_ACCENT);
        return button;
    }

    private Button secondaryButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(COLOR_INK);
        button.setBackgroundColor(COLOR_LINE);
        return button;
    }

    private TextView text(String value, int sp, int color, boolean strong) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(sp);
        text.setTextColor(color);
        text.setPadding(0, dp(3), 0, dp(3));
        if (strong) text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return text;
    }

    private void toast(String value) {
        Toast.makeText(this, value, Toast.LENGTH_SHORT).show();
    }

    private String readText(Uri uri) {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) return "";
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception error) {
            toast("Unable to read file");
            return "";
        }
    }

    private void writeText(Uri uri, String value) {
        try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
            if (output != null) output.write(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            toast("Unable to write file");
        }
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        long kb = bytes / 1024;
        if (kb < 1024) return kb + " KB";
        return (kb / 1024) + " MB";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class NoteStore {
    static final class Note {
        final String id;
        final String title;
        final String body;
        final String folder;
        final List<String> tags;
        final long createdAt;
        final long updatedAt;

        Note(String id, String title, String body, String folder, List<String> tags, long createdAt, long updatedAt) {
            this.id = id;
            this.title = title;
            this.body = body;
            this.folder = folder;
            this.tags = tags;
            this.createdAt = createdAt;
            this.updatedAt = updatedAt;
        }

        String preview() {
            String normalized = body.replace('\n', ' ').trim();
            return normalized.length() <= 140 ? normalized : normalized.substring(0, 137) + "...";
        }

        String tagsLabel() {
            return tags.isEmpty() ? "No tags" : "#" + String.join(" #", tags);
        }
    }

    static final class GraphSummary {
        final int notes;
        final int tags;
        final int links;
        final int backlinks;

        GraphSummary(int notes, int tags, int links, int backlinks) {
            this.notes = notes;
            this.tags = tags;
            this.links = links;
            this.backlinks = backlinks;
        }
    }

    static final class Backlink {
        final String sourceTitle;
        final String targetTitle;

        Backlink(String sourceTitle, String targetTitle) {
            this.sourceTitle = sourceTitle;
            this.targetTitle = targetTitle;
        }
    }

    private final SharedPreferences preferences;

    NoteStore(Context context) {
        preferences = context.getSharedPreferences("elephantnote-offline", Context.MODE_PRIVATE);
    }

    List<Note> list() {
        ArrayList<Note> notes = new ArrayList<>();
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            notes.add(fromJson(item));
        }
        Collections.sort(notes, (left, right) -> Long.compare(right.updatedAt, left.updatedAt));
        return notes;
    }

    List<Note> search(String query) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (needle.isEmpty()) return list();
        ArrayList<Note> results = new ArrayList<>();
        for (Note note : list()) {
            String haystack = (note.title + "\n" + note.folder + "\n" + note.body + "\n" + String.join(" ", note.tags)).toLowerCase(Locale.ROOT);
            if (haystack.contains(needle)) results.add(note);
        }
        return results;
    }

    Note create(String title, String body) {
        long now = System.currentTimeMillis();
        String resolvedTitle = title == null || title.trim().isEmpty() ? firstLine(body) : title.trim();
        Note note = new Note("note-" + now, resolvedTitle, body == null ? "" : body, inferFolder(body), extractTags(body), now, now);
        JSONArray array = readArray();
        array.put(toJson(note));
        writeArray(array);
        return note;
    }

    Note update(String id, String title, String body) {
        JSONArray next = new JSONArray();
        Note updated = null;
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            Note note = fromJson(item);
            if (id.equals(note.id)) {
                long now = System.currentTimeMillis();
                updated = new Note(
                    note.id,
                    title == null || title.trim().isEmpty() ? firstLine(body) : title.trim(),
                    body == null ? "" : body,
                    inferFolder(body),
                    extractTags(body),
                    note.createdAt,
                    now
                );
                next.put(toJson(updated));
            } else {
                next.put(item);
            }
        }
        writeArray(next);
        return updated;
    }

    int importMarkdown(String markdown) {
        String value = markdown == null ? "" : markdown.trim();
        if (value.isEmpty()) return 0;
        String[] chunks = value.split("(?m)^---\\s*$");
        int imported = 0;
        if (chunks.length > 2) {
            for (int index = 2; index < chunks.length; index += 2) {
                String body = chunks[index].trim();
                if (!body.isEmpty()) {
                    create("", body);
                    imported += 1;
                }
            }
        }
        if (imported == 0) {
            create("", value);
            imported = 1;
        }
        return imported;
    }

    void delete(String id) {
        JSONArray next = new JSONArray();
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null || id.equals(item.optString("id"))) continue;
            next.put(item);
        }
        writeArray(next);
    }

    List<String> folders() {
        LinkedHashSet<String> folders = new LinkedHashSet<>();
        for (Note note : list()) folders.add(note.folder);
        return new ArrayList<>(folders);
    }

    List<Note> listByFolder(String folder) {
        ArrayList<Note> notes = new ArrayList<>();
        for (Note note : list()) {
            if (note.folder.equals(folder)) notes.add(note);
        }
        return notes;
    }

    List<String> allTags() {
        Set<String> tags = new LinkedHashSet<>();
        for (Note note : list()) tags.addAll(note.tags);
        return new ArrayList<>(tags);
    }

    List<Note> listByTag(String tag) {
        String normalized = tag == null ? "" : tag.trim().toLowerCase(Locale.ROOT);
        ArrayList<Note> notes = new ArrayList<>();
        if (normalized.isEmpty()) return notes;
        for (Note note : list()) {
            if (note.tags.contains(normalized)) notes.add(note);
        }
        return notes;
    }

    Map<String, Integer> tagCounts() {
        LinkedHashMap<String, Integer> counts = new LinkedHashMap<>();
        for (Note note : list()) {
            for (String tag : note.tags) counts.put(tag, counts.containsKey(tag) ? counts.get(tag) + 1 : 1);
        }
        return counts;
    }

    GraphSummary graphSummary() {
        int links = 0;
        for (Note note : list()) links += note.tags.size();
        return new GraphSummary(list().size(), allTags().size(), links, backlinks().size());
    }

    List<Backlink> backlinks() {
        ArrayList<Backlink> links = new ArrayList<>();
        for (Note note : list()) {
            String body = note.body;
            int cursor = 0;
            while (cursor >= 0 && cursor < body.length()) {
                int start = body.indexOf("[[", cursor);
                if (start < 0) break;
                int end = body.indexOf("]]", start + 2);
                if (end < 0) break;
                String target = body.substring(start + 2, end).trim();
                if (!target.isEmpty()) links.add(new Backlink(note.title, target));
                cursor = end + 2;
            }
        }
        return links;
    }

    int totalWords() {
        int words = 0;
        for (Note note : list()) {
            String body = note.body.trim();
            if (!body.isEmpty()) words += body.split("\\s+").length;
        }
        return words;
    }

    String exportMarkdown() {
        StringBuilder builder = new StringBuilder();
        for (Note note : list()) {
            builder.append("---\n");
            builder.append("title: \"").append(note.title.replace("\"", "\\\"")).append("\"\n");
            builder.append("tags: [");
            for (int index = 0; index < note.tags.size(); index += 1) {
                if (index > 0) builder.append(", ");
                builder.append("\"").append(note.tags.get(index).replace("\"", "\\\"")).append("\"");
            }
            builder.append("]\n");
            builder.append("updatedAt: \"").append(note.updatedAt).append("\"\n");
            builder.append("---\n\n");
            builder.append(note.body).append("\n\n");
        }
        return builder.toString();
    }

    private Note fromJson(JSONObject item) {
        ArrayList<String> tags = new ArrayList<>();
        JSONArray tagArray = item.optJSONArray("tags");
        if (tagArray != null) {
            for (int index = 0; index < tagArray.length(); index += 1) {
                String tag = tagArray.optString(index, "").trim();
                if (!tag.isEmpty()) tags.add(tag);
            }
        } else {
            tags.addAll(extractTags(item.optString("body")));
        }
        long updatedAt = item.optLong("updatedAt", 0);
        return new Note(
            item.optString("id"),
            item.optString("title", "Untitled"),
            item.optString("body"),
            item.optString("folder", inferFolder(item.optString("body"))),
            tags,
            item.optLong("createdAt", updatedAt),
            updatedAt
        );
    }

    private JSONObject toJson(Note note) {
        JSONObject item = new JSONObject();
        try {
            item.put("id", note.id);
            item.put("title", note.title);
            item.put("body", note.body);
            item.put("folder", note.folder);
            item.put("tags", new JSONArray(note.tags));
            item.put("createdAt", note.createdAt);
            item.put("updatedAt", note.updatedAt);
        } catch (Exception ignored) {
        }
        return item;
    }

    private JSONArray readArray() {
        try {
            return new JSONArray(preferences.getString("notes", "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private void writeArray(JSONArray array) {
        preferences.edit().putString("notes", array.toString()).apply();
    }

    private static String firstLine(String body) {
        String value = body == null ? "" : body.trim();
        if (value.isEmpty()) return "Untitled";
        return value.split("\\R", 2)[0].trim();
    }

    private static String inferFolder(String body) {
        String value = body == null ? "" : body;
        for (String line : value.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.toLowerCase(Locale.ROOT).startsWith("folder:")) {
                String folder = trimmed.substring("folder:".length()).trim();
                if (!folder.isEmpty()) return folder;
            }
        }
        return "Mobile Inbox";
    }

    private static List<String> extractTags(String body) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        String value = body == null ? "" : body;
        for (String token : value.split("\\s+")) {
            if (!token.startsWith("#") || token.length() < 2) continue;
            String tag = token.substring(1).replaceAll("[^A-Za-z0-9_-]", "").toLowerCase(Locale.ROOT);
            if (!tag.isEmpty()) tags.add(tag);
            if (tags.size() >= 8) break;
        }
        return new ArrayList<>(tags);
    }
}

package com.elephantnote.mobile;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
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

    private static final String DEFAULT_FOLDER = "Mobile Inbox";
    private final File vaultRoot;
    private final File notesRoot;

    NoteStore(Context context) {
        this.vaultRoot = AndroidVaultPaths.vaultRoot(context);
        this.notesRoot = AndroidVaultPaths.notesRoot(context);
        AndroidVaultPaths.ensureDirectory(notesRoot);
        writeMobileManifest();
    }

    String vaultPath() {
        return vaultRoot.getAbsolutePath();
    }

    List<Note> list() {
        ArrayList<Note> notes = new ArrayList<>();
        collectMarkdownFiles(notesRoot, notes);
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
        String value = body == null ? "" : body;
        long now = System.currentTimeMillis();
        String resolvedTitle = title == null || title.trim().isEmpty() ? firstContentLine(value) : title.trim();
        String folder = inferFolder(value);
        File target = uniqueMarkdownFile(folder, resolvedTitle);
        writeText(target, value);
        target.setLastModified(now);
        return fromFile(target);
    }

    Note update(String id, String title, String body) {
        File current = fileFromId(id);
        Note existing = current == null ? null : fromFile(current);
        String value = body == null ? "" : body;
        String resolvedTitle = title == null || title.trim().isEmpty() ? firstContentLine(value) : title.trim();
        String folder = inferFolder(value);
        File target = fileFor(folder, resolvedTitle);
        if (target.exists() && existing != null && !sameFile(target, current)) target = uniqueMarkdownFile(folder, resolvedTitle);
        writeText(target, value);
        target.setLastModified(System.currentTimeMillis());
        if (current != null && !sameFile(current, target) && current.exists()) current.delete();
        pruneEmptyParents(current == null ? null : current.getParentFile());
        return fromFile(target);
    }

    int importMarkdown(String markdown) {
        String value = markdown == null ? "" : markdown.trim();
        if (value.isEmpty()) return 0;
        ArrayList<String> bodies = parseMarkdownBundle(value);
        int imported = 0;
        for (String body : bodies) {
            String cleanBody = stripFrontmatter(body).trim();
            if (!cleanBody.isEmpty()) {
                create("", cleanBody);
                imported += 1;
            }
        }
        if (imported == 0) {
            create("", stripFrontmatter(value).trim());
            imported = 1;
        }
        return imported;
    }

    void delete(String id) {
        File file = fileFromId(id);
        if (file != null && file.exists()) {
            File parent = file.getParentFile();
            file.delete();
            pruneEmptyParents(parent);
        }
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
            builder.append("folder: \"").append(note.folder.replace("\"", "\\\"")).append("\"\n");
            builder.append("path: \"").append(note.id.replace("\"", "\\\"")).append("\"\n");
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

    private void collectMarkdownFiles(File directory, List<Note> notes) {
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isDirectory()) {
                collectMarkdownFiles(file, notes);
            } else if (file.isFile() && file.getName().toLowerCase(Locale.ROOT).endsWith(".md")) {
                notes.add(fromFile(file));
            }
        }
    }

    private Note fromFile(File file) {
        String raw = readText(file);
        ParsedMarkdown parsed = parseMarkdown(raw);
        String relativePath = relativePath(file);
        String folder = parsed.folder == null || parsed.folder.trim().isEmpty() ? folderFromFile(file) : parsed.folder.trim();
        String title = parsed.title == null || parsed.title.trim().isEmpty() ? firstContentLine(parsed.body, file) : parsed.title.trim();
        List<String> tags = parsed.tags.isEmpty() ? extractTags(parsed.body) : parsed.tags;
        long updatedAt = file.lastModified();
        return new Note(relativePath, title, parsed.body, folder, tags, updatedAt, updatedAt);
    }

    private ParsedMarkdown parseMarkdown(String raw) {
        String value = raw == null ? "" : raw;
        ParsedMarkdown parsed = new ParsedMarkdown();
        if (!value.startsWith("---")) {
            parsed.body = value;
            return parsed;
        }
        String[] lines = value.split("\\R", -1);
        int end = -1;
        for (int index = 1; index < lines.length; index += 1) {
            if (lines[index].trim().equals("---")) {
                end = index;
                break;
            }
        }
        if (end < 0) {
            parsed.body = value;
            return parsed;
        }
        for (int index = 1; index < end; index += 1) parseFrontmatterLine(parsed, lines[index]);
        StringBuilder body = new StringBuilder();
        for (int index = end + 1; index < lines.length; index += 1) {
            if (body.length() > 0) body.append('\n');
            body.append(lines[index]);
        }
        parsed.body = body.toString().trim();
        return parsed;
    }

    private void parseFrontmatterLine(ParsedMarkdown parsed, String line) {
        String trimmed = line == null ? "" : line.trim();
        int colon = trimmed.indexOf(':');
        if (colon <= 0) return;
        String key = trimmed.substring(0, colon).trim().toLowerCase(Locale.ROOT);
        String value = unquote(trimmed.substring(colon + 1).trim());
        if ("title".equals(key)) parsed.title = value;
        else if ("folder".equals(key)) parsed.folder = value;
        else if ("tags".equals(key)) parsed.tags.addAll(parseTagsList(value));
    }

    private ArrayList<String> parseMarkdownBundle(String value) {
        ArrayList<String> chunks = new ArrayList<>();
        String[] parts = value.split("(?m)^---\\s*$");
        if (parts.length > 2) {
            for (int index = 2; index < parts.length; index += 2) {
                String body = parts[index].trim();
                if (!body.isEmpty()) chunks.add(body);
            }
        }
        if (chunks.isEmpty()) chunks.add(value);
        return chunks;
    }

    private String stripFrontmatter(String value) {
        return parseMarkdown(value).body;
    }

    private File uniqueMarkdownFile(String folder, String title) {
        File target = fileFor(folder, title);
        if (!target.exists()) return target;
        String baseName = stripMarkdownExtension(target.getName());
        File parent = target.getParentFile();
        for (int index = 2; index < 1000; index += 1) {
            File candidate = new File(parent, baseName + "-" + index + ".md");
            if (!candidate.exists()) return candidate;
        }
        return new File(parent, baseName + "-" + System.currentTimeMillis() + ".md");
    }

    private File fileFor(String folder, String title) {
        File directory = folderDirectory(folder);
        AndroidVaultPaths.ensureDirectory(directory);
        return new File(directory, safeSegment(title) + ".md");
    }

    private File fileFromId(String id) {
        if (id == null || id.trim().isEmpty()) return null;
        File candidate = new File(notesRoot, id.replace('/', File.separatorChar));
        try {
            String root = notesRoot.getCanonicalPath();
            String path = candidate.getCanonicalPath();
            return path.equals(root) || !path.startsWith(root + File.separator) ? null : candidate;
        } catch (Exception ignored) {
            return null;
        }
    }

    private File folderDirectory(String folder) {
        String value = folder == null || folder.trim().isEmpty() ? DEFAULT_FOLDER : folder.trim();
        File directory = notesRoot;
        for (String segment : value.split("[/\\\\]+")) {
            String safe = safeSegment(segment);
            if (!safe.isEmpty()) directory = new File(directory, safe);
        }
        return directory;
    }

    private String folderFromFile(File file) {
        File parent = file.getParentFile();
        if (parent == null || sameFile(parent, notesRoot)) return DEFAULT_FOLDER;
        String relative = relativePath(parent);
        return relative.isEmpty() ? DEFAULT_FOLDER : relative;
    }

    private String relativePath(File file) {
        try {
            String root = notesRoot.getCanonicalPath();
            String path = file.getCanonicalPath();
            if (path.equals(root)) return "";
            if (!path.startsWith(root + File.separator)) return file.getName();
            return path.substring(root.length() + 1).replace(File.separatorChar, '/');
        } catch (Exception ignored) {
            return file.getName();
        }
    }

    private void writeMobileManifest() {
        File manifest = new File(new File(vaultRoot, ".elephantnote"), "mobile-vault.json");
        if (manifest.exists()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("version", 1);
            payload.put("kind", "elephantnote-android-vault");
            payload.put("notesRoot", "Notes");
            payload.put("attachmentsRoot", "Attachments");
            payload.put("aiExecution", "desktop-only");
            writeText(manifest, payload.toString(2));
        } catch (Exception ignored) {
        }
    }

    private String readText(File file) {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (builder.length() > 0) builder.append('\n');
                builder.append(line);
            }
        } catch (Exception ignored) {
        }
        return builder.toString();
    }

    private void writeText(File file, String value) {
        try {
            File parent = file.getParentFile();
            AndroidVaultPaths.ensureDirectory(parent);
            try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
                writer.write(value == null ? "" : value);
            }
        } catch (Exception ignored) {
        }
    }

    private void pruneEmptyParents(File directory) {
        if (directory == null) return;
        try {
            String root = notesRoot.getCanonicalPath();
            File cursor = directory;
            while (cursor != null && !cursor.getCanonicalPath().equals(root)) {
                String[] children = cursor.list();
                if (children != null && children.length == 0) {
                    File parent = cursor.getParentFile();
                    cursor.delete();
                    cursor = parent;
                } else {
                    break;
                }
            }
        } catch (Exception ignored) {
        }
    }

    private boolean sameFile(File left, File right) {
        if (left == null || right == null) return false;
        try {
            return left.getCanonicalPath().equals(right.getCanonicalPath());
        } catch (Exception ignored) {
            return left.equals(right);
        }
    }

    private static String firstContentLine(String body) {
        return firstContentLine(body, null);
    }

    private static String firstContentLine(String body, File fallbackFile) {
        String value = body == null ? "" : body.trim();
        for (String line : value.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            if (trimmed.toLowerCase(Locale.ROOT).startsWith("folder:")) continue;
            if (trimmed.startsWith("#") && !trimmed.startsWith("# ")) continue;
            if (trimmed.startsWith("# ")) trimmed = trimmed.substring(2).trim();
            if (!trimmed.isEmpty()) return trimmed.length() <= 80 ? trimmed : trimmed.substring(0, 80).trim();
        }
        if (fallbackFile != null) return stripMarkdownExtension(fallbackFile.getName());
        return "Untitled";
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
        return DEFAULT_FOLDER;
    }

    private static List<String> extractTags(String body) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        String value = body == null ? "" : body;
        for (String token : value.split("\\s+")) {
            if (!token.startsWith("#") || token.length() < 2) continue;
            String tag = token.substring(1).replaceAll("[^A-Za-z0-9_-]", "").toLowerCase(Locale.ROOT);
            if (!tag.isEmpty()) tags.add(tag);
            if (tags.size() >= 16) break;
        }
        return new ArrayList<>(tags);
    }

    private static List<String> parseTagsList(String value) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        String cleaned = value == null ? "" : value.trim();
        if (cleaned.startsWith("[") && cleaned.endsWith("]")) cleaned = cleaned.substring(1, cleaned.length() - 1);
        for (String part : cleaned.split(",")) {
            String tag = unquote(part.trim()).replaceAll("[^A-Za-z0-9_-]", "").toLowerCase(Locale.ROOT);
            if (!tag.isEmpty()) tags.add(tag);
        }
        return new ArrayList<>(tags);
    }

    private static String safeSegment(String value) {
        String cleaned = value == null ? "" : value.trim();
        cleaned = cleaned.replaceAll("[\\r\\n\\t]", " ").replaceAll("[^A-Za-z0-9 ._-]", "_").trim();
        while (cleaned.contains("  ")) cleaned = cleaned.replace("  ", " ");
        if (cleaned.isEmpty() || ".".equals(cleaned) || "..".equals(cleaned)) cleaned = "Untitled";
        if (cleaned.length() > 80) cleaned = cleaned.substring(0, 80).trim();
        return cleaned;
    }

    private static String stripMarkdownExtension(String name) {
        if (name == null || name.isEmpty()) return "Untitled";
        return name.toLowerCase(Locale.ROOT).endsWith(".md") ? name.substring(0, name.length() - 3) : name;
    }

    private static String unquote(String value) {
        String trimmed = value == null ? "" : value.trim();
        if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static final class ParsedMarkdown {
        String title;
        String folder;
        String body = "";
        final List<String> tags = new ArrayList<>();
    }
}

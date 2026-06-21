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
import java.util.List;

final class CalendarStore {
    static final class Event {
        final String id;
        final String title;
        final String when;
        final String notes;
        final long createdAt;

        Event(String id, String title, String when, String notes, long createdAt) {
            this.id = id;
            this.title = title;
            this.when = when;
            this.notes = notes;
            this.createdAt = createdAt;
        }
    }

    private final File file;

    CalendarStore(Context context) {
        File workspace = AndroidVaultPaths.workspaceRoot(context);
        AndroidVaultPaths.ensureDirectory(workspace);
        file = new File(workspace, "mobile-calendar.json");
    }

    List<Event> list() {
        ArrayList<Event> events = new ArrayList<>();
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            events.add(new Event(
                item.optString("id"),
                item.optString("title", "Untitled event"),
                item.optString("when", ""),
                item.optString("notes", ""),
                item.optLong("createdAt", 0)
            ));
        }
        Collections.sort(events, (left, right) -> Long.compare(right.createdAt, left.createdAt));
        return events;
    }

    Event create(String title, String when, String notes) {
        long now = System.currentTimeMillis();
        Event event = new Event(
            "event-" + now,
            emptyToDefault(title, "Untitled event"),
            emptyToDefault(when, "No date"),
            notes == null ? "" : notes.trim(),
            now
        );
        JSONArray array = readArray();
        JSONObject item = new JSONObject();
        try {
            item.put("id", event.id);
            item.put("title", event.title);
            item.put("when", event.when);
            item.put("notes", event.notes);
            item.put("createdAt", event.createdAt);
            array.put(item);
            writeArray(array);
        } catch (Exception ignored) {
        }
        return event;
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

    private JSONArray readArray() {
        if (!file.exists()) return new JSONArray();
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
            return new JSONArray(builder.toString());
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private void writeArray(JSONArray array) {
        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(array.toString());
        } catch (Exception ignored) {
        }
    }

    private static String emptyToDefault(String value, String fallback) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}

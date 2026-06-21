package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
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

    private final SharedPreferences preferences;

    CalendarStore(Context context) {
        preferences = context.getSharedPreferences("elephantnote-calendar", Context.MODE_PRIVATE);
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
        try {
            return new JSONArray(preferences.getString("events", "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private void writeArray(JSONArray array) {
        preferences.edit().putString("events", array.toString()).apply();
    }

    private static String emptyToDefault(String value, String fallback) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}

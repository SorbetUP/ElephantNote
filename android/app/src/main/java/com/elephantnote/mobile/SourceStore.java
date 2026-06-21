package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class SourceStore {
    static final class Source {
        final String id;
        final String title;
        final String url;
        final long createdAt;

        Source(String id, String title, String url, long createdAt) {
            this.id = id;
            this.title = title;
            this.url = url;
            this.createdAt = createdAt;
        }
    }

    private final SharedPreferences preferences;

    SourceStore(Context context) {
        preferences = context.getSharedPreferences("elephantnote-sources", Context.MODE_PRIVATE);
    }

    List<Source> list() {
        ArrayList<Source> sources = new ArrayList<>();
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            sources.add(new Source(
                item.optString("id"),
                item.optString("title", "Untitled source"),
                item.optString("url", ""),
                item.optLong("createdAt", 0)
            ));
        }
        Collections.sort(sources, (left, right) -> Long.compare(right.createdAt, left.createdAt));
        return sources;
    }

    Source create(String title, String url) {
        long now = System.currentTimeMillis();
        Source source = new Source(
            "source-" + now,
            emptyToDefault(title, "Untitled source"),
            emptyToDefault(url, ""),
            now
        );
        JSONArray array = readArray();
        JSONObject item = new JSONObject();
        try {
            item.put("id", source.id);
            item.put("title", source.title);
            item.put("url", source.url);
            item.put("createdAt", source.createdAt);
            array.put(item);
            writeArray(array);
        } catch (Exception ignored) {
        }
        return source;
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
            return new JSONArray(preferences.getString("sources", "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private void writeArray(JSONArray array) {
        preferences.edit().putString("sources", array.toString()).apply();
    }

    private static String emptyToDefault(String value, String fallback) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}

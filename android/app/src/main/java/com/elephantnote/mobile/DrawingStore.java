package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class DrawingStore {
    static final class Drawing {
        final String id;
        final String title;
        final String strokes;
        final long updatedAt;

        Drawing(String id, String title, String strokes, long updatedAt) {
            this.id = id;
            this.title = title;
            this.strokes = strokes;
            this.updatedAt = updatedAt;
        }

        int strokeCount() {
            if (strokes == null || strokes.trim().isEmpty()) return 0;
            return strokes.split("\\|", -1).length;
        }
    }

    private final SharedPreferences preferences;

    DrawingStore(Context context) {
        preferences = context.getSharedPreferences("elephantnote-drawings", Context.MODE_PRIVATE);
    }

    List<Drawing> list() {
        ArrayList<Drawing> drawings = new ArrayList<>();
        JSONArray array = readArray();
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            drawings.add(new Drawing(
                item.optString("id"),
                item.optString("title", "Untitled canvas"),
                item.optString("strokes", ""),
                item.optLong("updatedAt", 0)
            ));
        }
        Collections.sort(drawings, (left, right) -> Long.compare(right.updatedAt, left.updatedAt));
        return drawings;
    }

    Drawing get(String id) {
        for (Drawing drawing : list()) {
            if (drawing.id.equals(id)) return drawing;
        }
        return null;
    }

    Drawing save(String id, String title, String strokes) {
        long now = System.currentTimeMillis();
        String nextId = id == null || id.trim().isEmpty() ? "drawing-" + now : id;
        Drawing drawing = new Drawing(
            nextId,
            title == null || title.trim().isEmpty() ? "Untitled canvas" : title.trim(),
            strokes == null ? "" : strokes,
            now
        );
        JSONArray next = new JSONArray();
        JSONArray array = readArray();
        boolean replaced = false;
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            if (nextId.equals(item.optString("id"))) {
                next.put(toJson(drawing));
                replaced = true;
            } else {
                next.put(item);
            }
        }
        if (!replaced) next.put(toJson(drawing));
        writeArray(next);
        return drawing;
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

    private JSONObject toJson(Drawing drawing) {
        JSONObject item = new JSONObject();
        try {
            item.put("id", drawing.id);
            item.put("title", drawing.title);
            item.put("strokes", drawing.strokes);
            item.put("updatedAt", drawing.updatedAt);
        } catch (Exception ignored) {
        }
        return item;
    }

    private JSONArray readArray() {
        try {
            return new JSONArray(preferences.getString("drawings", "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private void writeArray(JSONArray array) {
        preferences.edit().putString("drawings", array.toString()).apply();
    }
}

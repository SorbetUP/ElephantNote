package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

final class NoteStore {
    static final class Note {
        final String id;
        final String title;
        final String body;
        final long updatedAt;

        Note(String id, String title, String body, long updatedAt) {
            this.id = id;
            this.title = title;
            this.body = body;
            this.updatedAt = updatedAt;
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
            notes.add(new Note(
                item.optString("id"),
                item.optString("title", "Untitled"),
                item.optString("body"),
                item.optLong("updatedAt", 0)
            ));
        }
        return notes;
    }

    Note create(String title, String body) {
        long now = System.currentTimeMillis();
        Note note = new Note("note-" + now, title.trim().isEmpty() ? "Untitled" : title.trim(), body, now);
        JSONArray array = readArray();
        JSONObject item = new JSONObject();
        try {
            item.put("id", note.id);
            item.put("title", note.title);
            item.put("body", note.body);
            item.put("updatedAt", note.updatedAt);
            array.put(item);
            preferences.edit().putString("notes", array.toString()).apply();
        } catch (Exception ignored) {
        }
        return note;
    }

    private JSONArray readArray() {
        try {
            return new JSONArray(preferences.getString("notes", "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }
}

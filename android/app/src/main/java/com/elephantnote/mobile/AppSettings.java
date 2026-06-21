package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;

final class AppSettings {
    final String embeddingModel;
    final String chatModel;
    final String ocrModel;
    final boolean localAiEnabled;
    final boolean showModelLibrary;

    private final SharedPreferences preferences;

    private AppSettings(SharedPreferences preferences) {
        this.preferences = preferences;
        this.embeddingModel = preferences.getString("embeddingModel", "smollm2-node-llama-cpp");
        this.chatModel = preferences.getString("chatModel", "smollm2-node-llama-cpp-chat");
        this.ocrModel = preferences.getString("ocrModel", "local-tesseract-ocr");
        this.localAiEnabled = preferences.getBoolean("localAiEnabled", true);
        this.showModelLibrary = preferences.getBoolean("showModelLibrary", true);
    }

    static AppSettings load(Context context) {
        return new AppSettings(context.getSharedPreferences("elephantnote-settings", Context.MODE_PRIVATE));
    }

    AppSettings saveModels(String embedding, String chat, String ocr) {
        preferences.edit()
            .putString("embeddingModel", emptyToDefault(embedding, "smollm2-node-llama-cpp"))
            .putString("chatModel", emptyToDefault(chat, "smollm2-node-llama-cpp-chat"))
            .putString("ocrModel", emptyToDefault(ocr, "local-tesseract-ocr"))
            .apply();
        return new AppSettings(preferences);
    }

    AppSettings saveLocalAi(boolean enabled, boolean modelLibraryVisible) {
        preferences.edit()
            .putBoolean("localAiEnabled", enabled)
            .putBoolean("showModelLibrary", modelLibraryVisible)
            .apply();
        return new AppSettings(preferences);
    }

    private static String emptyToDefault(String value, String fallback) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}

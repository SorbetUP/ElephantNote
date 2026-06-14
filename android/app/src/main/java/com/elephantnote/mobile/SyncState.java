package com.elephantnote.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

final class SyncState {
    final String deviceId;
    final String folderId;
    final String remote;

    private SyncState(String deviceId, String folderId, String remote) {
        this.deviceId = deviceId;
        this.folderId = folderId;
        this.remote = remote;
    }

    static SyncState load(Context context) {
        SharedPreferences preferences = context.getSharedPreferences("elephantnote-sync", Context.MODE_PRIVATE);
        String deviceId = preferences.getString("deviceId", "");
        if (deviceId.isEmpty()) {
            deviceId = "en-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            preferences.edit().putString("deviceId", deviceId).apply();
        }
        return new SyncState(
            deviceId,
            preferences.getString("folderId", "vault-mobile"),
            preferences.getString("remote", "")
        );
    }
}

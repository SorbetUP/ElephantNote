# Mobile development (Android + iOS)

This repo uses **Tauri v2** for desktop and mobile. The mobile apps run the same web frontend (`app/`) inside a native WebView, with a local Rust runtime (`app/src-tauri/`) providing the local-first SQLite + HTTP API.

## Prerequisites

### Common
- `bun` (see repo `package.json` engines)
- Rust toolchain (`rustup`)

### Android
- Android Studio + Android SDK
- A device (recommended) or emulator

### iOS (macOS only)
- Xcode
- Open Xcode once and install the required iOS platform + simulator runtime in **Xcode > Settings > Components** (if `xcodebuild` says “iOS <version> is not installed”).
- CocoaPods (`pod`)
- An Apple development team (even for local device installs)

## Commands

From the repo root:

### Install dependencies
```bash
bun install
```

### Android (dev)
```bash
cd app
bun run tauri:android:dev
```

### Android (build)
```bash
cd app
bun run tauri:android:build
```

### Android (build debug APK, installable)
```bash
cd app
bun run tauri:android:apk:arm64
```

Build artifacts (Android) are generated under:
- `app/src-tauri/gen/android/app/build/outputs/apk/**`
- `app/src-tauri/gen/android/app/build/outputs/bundle/**`

## Android validation checklist

### Install the debug APK
```bash
adb install -r app/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
```

### Local-first (no endpoint configured)
- Launch the app once to let it create the local SQLite + local API config.
- Optional sanity checks (emulator or device):
```bash
adb shell run-as com.blinko.app ls -la blinko
adb shell run-as com.blinko.app cat blinko/local_config.json
```

If you want to hit the local API from your host:
1) Read the local port from `blinko/local_config.json`.
2) Forward that port:
```bash
adb forward tcp:<port> tcp:<port>
curl -i "http://127.0.0.1:<port>/health?token=<token>"
```

### Remote mode (endpoint configured)
- Run the backend on your host:
```bash
cd server
bun run dev
```
- In the Android emulator, your host is reachable at `http://10.0.2.2:1111` (default dev port).
- In a debug build, you can set the endpoint via a deep link:
```bash
adb shell "am start -a android.intent.action.VIEW -d 'blinko://shortcut/set_endpoint?value=http%3A%2F%2F10.0.2.2%3A1111' -n com.blinko.app/.MainActivity"
```

### Sync verification (local <-> remote)
- In the app: create a note locally, then press **Sync now**.
- Attach a file, press **Sync now**, then verify on the server that:
  - The file is visible in **Resources**
  - `GET /api/file/by-sync-id/:syncId` returns a non-empty binary
- On the host, you can verify the push arrived by pulling remote ops:
```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:1111/api/auth/login -H 'content-type: application/json' -d '{"username":"admin","password":"admin123"}' | python -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -sS "http://127.0.0.1:1111/changes?since=0" -H "authorization: Bearer $TOKEN" | head -c 400 && echo
```

### Server replication (Server Sync)
- In **Settings → Sync**, use the “Server replication” section.
- This requires a **superadmin token** on the selected server (`/api/server-sync/*` endpoints).

### Android share (text + file)
- Share text or a file (from Files/Photos/Gallery) to Blinko.
- The Android app copies any `content://` shared file into the app sandbox before the web layer reads it (more reliable than trying to read the URI directly).

### iOS (one-time init)
```bash
cd app
bun run tauri:ios:init
```

### iOS (dev)
```bash
cd app
bun run tauri:ios:dev
```

### iOS (build)
```bash
cd app
bun run tauri:ios:build
```

## Notes

### iOS code signing
Tauri will warn if no signing certificate is configured. For local device installs you still need:
- an Apple dev account
- a development team set in the iOS build settings / config.

You can provide the team id via:
- env var: `APPLE_DEVELOPMENT_TEAM=YOUR_TEAM_ID`
- or Tauri config: `bundle > iOS > developmentTeam`

If you see errors like:
- `iOS <version> is not installed`
- `Xcode Simulator SDK <version> is not installed`

Install the missing components via **Xcode > Settings > Components**, then re-run.

To verify what Xcode sees:
```bash
xcodebuild -showsdks
```

### Local API on iOS (ATS)
The iOS target is configured to allow HTTP calls to `localhost` / `127.0.0.1` so the WebView can reach the embedded local API server.

### iOS “Share to Blinko”
An iOS Share Extension is included in the generated Xcode project (`app/src-tauri/gen/apple/`) and writes shared content into an App Group inbox. The Blinko app reads the pending payload on foreground and opens the editor.

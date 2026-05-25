# Phase 0 Mobile Constraints

## Tauri mobile runtime
- Mobile entrypoint registers local API commands + note fallback commands, and starts the local API in setup. `app/src-tauri/src/lib.rs:120-170`
- Tauri config devUrl points to http://localhost:1111 (still used for dev web content). `app/src-tauri/tauri.conf.json:6-10`
- CSP allowlist permits local API fetches (127.0.0.1/localhost) via connect-src. `app/src-tauri/tauri.conf.json:15-16`

## Plugin and permission constraints
- Mobile capabilities allow fs:scope for $DOWNLOAD and $APPDATA (including subpaths). `app/src-tauri/capabilities/mobile.json:35-50`
- Mobile capability set includes fs/dialog/upload/process permissions for local storage + uploads. `app/src-tauri/capabilities/mobile.json:12-66`

## UX constraints already visible in code
- Download flow writes to downloadDir on Android and skips iOS (TODO). `app/src/lib/tauriHelper.ts:80-119`
- Platform detection uses @tauri-apps/plugin-os (android/ios/desktop checks). `app/src/lib/tauriHelper.ts:24-55`

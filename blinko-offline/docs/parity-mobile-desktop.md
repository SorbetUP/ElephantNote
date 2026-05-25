# Parity (Desktop ↔ Mobile)

This document summarizes feature parity expectations between the desktop app and the Android/iOS apps.

## Scope
- Target parity: **Global + Sync**
- Explicit desktop-only: tray, global hotkeys, multi-window quick tools (replaced on mobile by shortcuts/deep links / mobile UI)

## Sources of truth
- Global: `agent/features-global.md`
- Mobile specifics/equivalents: `agent/features-mobile.md`
- Desktop-only: `agent/features-pc.md`

## Desktop-only features (not 1:1 on mobile)
Mobile apps intentionally do **not** implement these desktop integrations:
- System tray
- Global hotkeys
- Multi-window “quick” pages (quicknote/quickai/quicktool windows)

## Mobile equivalents
- Quick actions: Android app shortcuts + deep links
- Share-in: Android share intent (text + file)

## Sync parity (critical)
- Local-first mode uses embedded SQLite + local HTTP API on **all** Tauri targets.
- Sync-to-server uploads attachments reliably and retryably; failures remain pending and are visible via `/sync/status`.


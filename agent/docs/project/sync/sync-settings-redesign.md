# Sync settings redesign

## Goal

The Sync page should answer three questions without exposing transport internals:

1. Did the last synchronization complete?
2. Which devices are paired with this vault?
3. Is there a recovered version that needs attention?

The page is intentionally not a miniature administration dashboard. It uses the same card, button, field, badge, icon-tile, spacing, and surface primitives as the surrounding Settings pages.

## Page hierarchy

### 1. Synchronization status

The first card contains one clear state and one primary action.

Supported states:

- no active vault;
- no paired device;
- ready for the first synchronization;
- synchronization running;
- last synchronization completed;
- last synchronization failed.

A paired peer is not presented as online. The backend currently proves trust and records `lastSeenAt`, but it does not expose a durable reachability state. The UI therefore uses the neutral label `Paired`.

### 2. Devices

The device list displays a human name and last synchronization/seen time. The Iroh EndpointId is omitted from normal rows and appears only in Advanced diagnostics.

`Add device` opens a focused dialog rather than navigating to a second settings subpage.

The redesign does not invent rename, remove, online, or reconnect actions. Those controls must be added only after real backend commands and tests exist.

### 3. Conflict protection

Conflict retention and recovered copies stay on the same page. A contextual warning appears near the top only when the last synchronization preserved versions.

Restore remains non-destructive: it never silently overwrites the current note. Delete removes only the selected local temporary copy.

### 4. Advanced

The collapsed Advanced section contains the vault path, shortened local device identifier, and protocol safety explanation. It is not part of the normal task flow.

## Pairing dialog

The dialog has two explicit modes.

### Invite another device

The app requests a real ten-minute invitation from the Iroh backend, then generates a QR code locally from the returned payload.

Available transfer methods:

- scan the QR payload;
- share a `.elephantnote-invite` file through the operating-system share sheet;
- save the file manually;
- copy the raw invitation code.

The share sheet is the WhatsApp integration. ElephantNote does not hard-code or imitate WhatsApp: on systems where the Web Share API accepts files, the installed share targets decide whether WhatsApp, Messages, Mail, or another application is offered. If native file sharing is unavailable or fails, the file is downloaded instead.

### Join with an invitation

The receiving device can:

- select a `.elephantnote-invite` file;
- drag and drop the file;
- paste the raw invitation code.

Before the backend is called, the frontend validates:

- JSON syntax;
- protocol `elephantnote-iroh-sync-v1`;
- invitation id, token, endpoint address, and vault id;
- expiration time;
- maximum imported file size of 1 MiB.

The backend remains authoritative and authenticates the token and remote EndpointId.

## Link decision

No invitation URL is displayed in this redesign because ElephantNote does not currently register a tested application URL scheme. A URL that merely contains the credential but cannot open ElephantNote would be misleading.

A future deep-link implementation must include all of the following before the UI exposes a link:

- registered desktop and mobile protocol handlers;
- safe argument parsing;
- foreground and cold-start handling;
- expiration validation;
- tests on Windows, macOS, Linux, Android, and iOS targets that are officially supported;
- explicit confirmation before pairing.

Until then, the invitation file is the portable and honest cross-application mechanism.

## Accessibility and responsive behavior

- The pairing surface uses dialog semantics and an accessible title.
- Pairing modes expose tab roles and selected state.
- QR content has descriptive alternative text and is never the only transfer mechanism.
- File import works with a picker and drag and drop.
- Errors and successful validation are presented as text, not color alone.
- On narrow windows, device rows, conflict actions, the status card, and QR/share columns stack without horizontal scrolling.

## Validation contracts

The unit contract suite verifies that:

- real Tauri Iroh commands remain connected;
- old rclone/shared-folder controls do not return;
- the page no longer contains internal Overview/Devices/Conflicts tabs;
- QR generation uses the actual backend invitation payload;
- file export, native sharing, fallback download, import, drag and drop, protocol checks, and expiration checks are present;
- conflict retention, restore, delete, and toolbar synchronization remain wired to real implementations;
- generic Settings cards and controls are not reimplemented locally in the Sync component.

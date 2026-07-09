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

The app requests a real ten-minute invitation from the Iroh backend, validates it, then generates a QR code locally from the exact JSON payload.

Available transfer methods:

- scan the QR payload from ElephantNote on the receiving device;
- share a `.elephantnote-invite` file through the operating-system share sheet;
- save the file manually;
- copy the raw invitation code.

The QR is rendered as a 640 × 640 PNG with a four-module quiet zone. The visible UI may scale the image down, but the encoded image keeps enough pixels per module for dense Iroh endpoint payloads.

The share sheet is the WhatsApp integration. ElephantNote does not hard-code or imitate WhatsApp: on systems where the Web Share API accepts files, the installed share targets decide whether WhatsApp, Messages, Mail, or another application is offered. If native file sharing is unavailable or fails, the file is downloaded instead.

### Join with an invitation

The receiving device can:

- scan continuously with the camera selected by `facingMode: environment`;
- invoke the mobile system camera through an `image/*` input with `capture="environment"`, then decode the captured photograph after control returns to ElephantNote;
- choose an existing QR image;
- select a `.elephantnote-invite` file;
- drag and drop the invitation file;
- paste the raw invitation code.

The live and still-image scanners use ZXing locally. Camera frames and selected images are not uploaded. The camera stream is stopped when the dialog closes, the user changes mode, the component unmounts, or a valid invitation is decoded.

Before the backend is called, every route uses the same validator and checks:

- JSON syntax;
- protocol `elephantnote-iroh-sync-v1`;
- invitation id, token, endpoint address, and vault id;
- expiration time;
- maximum imported invitation-file size of 1 MiB.

The backend remains authoritative and authenticates the token and remote EndpointId.

### Camera permissions

macOS builds include `NSCameraUsageDescription` in `Elephant/backend/tauri/Info.plist`. Other webviews request camera access through `getUserMedia`; a denied or unavailable camera falls back to the system-camera/image route and invitation file route.

A real camera cannot be synthesized by unit CI. The scanner integration is therefore covered by build/lint contracts, while the QR payload itself is tested by an independent encode/decode round trip.

## Development dependency guard

`pnpm` installs this repository's dependencies under `Elephant/node_modules` because `.npmrc` sets `modules-dir=Elephant/node_modules`. Switching to a branch that adds a package can therefore leave an older local installation in place even though `package.json` and `pnpm-lock.yaml` are correct.

Before Tauri or Vite starts, `build/scripts/ensure-dev-dependencies.mjs` now:

1. hashes `package.json`, `pnpm-lock.yaml`, and `.npmrc`;
2. verifies Vite, `qrcode`, and `@zxing/browser` are actually resolvable from the frontend tree;
3. runs `pnpm install --frozen-lockfile --prefer-offline` when the package metadata changed or modules are missing;
4. verifies the installed modules after pnpm returns;
5. records the successful fingerprint under `Elephant/node_modules` and skips installation on the next unchanged run.

A failed or inconsistent install stops `pnpm tauri:dev` before Vite can return misleading HTTP 500 module-resolution errors.

## Link decision

No invitation URL is displayed in this redesign because ElephantNote does not currently register a tested application URL scheme. A URL that merely contains the credential but cannot open ElephantNote would be misleading.

A future deep-link implementation must include all of the following before the UI exposes a link:

- registered desktop and mobile protocol handlers;
- safe argument parsing;
- foreground and cold-start handling;
- expiration validation;
- tests on Windows, macOS, Linux, Android, and iOS targets that are officially supported;
- explicit confirmation before pairing.

Until then, the integrated scanner and invitation file are the portable and honest mechanisms. The system-camera capture route allows use of the phone's normal camera UI without pretending that an unregistered URL can open ElephantNote.

## Accessibility and responsive behavior

- The pairing surface uses dialog semantics and an accessible title.
- Pairing modes expose tab roles and selected state.
- QR content has descriptive alternative text and is never the only transfer mechanism.
- The scanner preview has an accessible label and a visible stop action.
- Camera errors provide a file/image fallback rather than failing silently.
- File import works with a picker and drag and drop.
- Errors and successful validation are presented as text, not color alone.
- On narrow windows, device rows, conflict actions, the status card, QR/share columns, and scanner actions stack without horizontal scrolling.

## Validation contracts

The focused suite verifies that:

- real Tauri Iroh commands remain connected;
- old rclone/shared-folder controls do not return;
- the page no longer contains internal Overview/Devices/Conflicts tabs;
- QR generation uses the actual backend invitation payload;
- a real PNG QR generated from a representative Iroh invitation is decoded byte-for-byte by the independent ZXing decoder;
- the browser data-URL generator produces a QR that decodes to the same payload;
- a `.elephantnote-invite` `File` is read back byte-for-byte and passes the shared validator;
- QR, file, and pasted code resolve to the exact same temporary credential;
- expired, malformed, and incomplete QR/file payloads are rejected;
- live camera scanning, rear-camera constraints, system-camera capture, and still-image decoding remain wired;
- dependency metadata changes are detected after switching branches;
- the real development dependency guard performs a frozen pnpm install and then skips the unchanged second run;
- file export, native sharing, fallback download, import, drag and drop, protocol checks, and expiration checks are present;
- conflict retention, restore, delete, and toolbar synchronization remain wired to real implementations;
- generic Settings cards and controls are not reimplemented locally in the Sync component.

The dedicated `Sync Invitation Validation` workflow executes 21 focused tests across three suites. Its output includes the real pnpm dependency-repair run and is uploaded on every execution so a green status is backed by inspectable evidence rather than a hidden or smoke-only assertion.

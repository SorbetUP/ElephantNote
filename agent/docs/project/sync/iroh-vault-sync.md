# ElephantNote Iroh vault synchronization

## Scope

The Iroh backend synchronizes vault content between explicitly paired ElephantNote devices. It includes normal notes, folders, `.assets`, and other non-device-specific content.

Configuration is intentionally local to each device. A phone and a desktop can therefore use different providers, models, layouts, runtime settings, and local UI state without overwriting each other.

The following local/runtime paths are intentionally excluded:

- `.config/` — provider and runtime configuration
- `.conflit/` — temporary local conflict archive
- `.elephantnote/config/` — workspace, vault, calendar, sources, and other application configuration
- `.elephantnote/models/` — local model/provider selection and locally available runtime information
- `.elephantnote/state/` — device-specific application and UI state
- `.elephantnote/sync/` — peer identities, baselines, queues, and transfer state
- `.elephantnote/cache/` — rebuildable cache
- `.elephantnote/index/` — rebuildable search index
- `.git/`, `node_modules/`, OS metadata, editor temporary files, and symlinks

These exclusions happen when the manifest is built. Consequently, excluded files cannot be uploaded, downloaded, deleted remotely, or turned into ordinary synchronization changes. An older baseline that still mentions a configuration file also cannot cause that local configuration file to be deleted.

## Transport and identity

- Iroh endpoint identity is a persistent Ed25519 secret stored in the Tauri application config directory, outside every vault.
- The endpoint uses QUIC with the ALPN `elephantnote/vault-sync/1`.
- LAN address discovery uses `iroh-mdns-address-lookup` with the service name `elephantnote-v1`.
- The `Minimal` Iroh preset is used: no public relay or cloud service is required.
- Every accepted connection is authenticated by its Iroh `EndpointId`.

## Pairing and application integration

The Sync settings panel calls the real Tauri commands directly. It does not expose the previous rclone/shared-folder controls.

1. Device A creates a ten-minute invitation from Settings → Sync.
2. The invitation contains Device A's `EndpointAddr`, vault identifier, invitation identifier, and a random one-time token.
3. Only the BLAKE3 hash of the one-time token is persisted by Device A.
4. The invitation can be moved to Device B in five equivalent forms:
   - a locally generated QR code containing the exact invitation payload;
   - the integrated live camera scanner on Device B;
   - a photo captured with the system camera, or an existing QR image, decoded locally after returning to ElephantNote;
   - a `.elephantnote-invite` file shared through WhatsApp, Messages, Mail, or another application;
   - manual copy and paste as a fallback.
5. Device B validates the decoded/imported payload and confirms pairing from its own Sync settings panel.
6. Device B connects over Iroh and sends the token on the encrypted connection.
7. Both devices persist the authenticated remote `EndpointId` as a trusted peer for that vault.
8. Either device can run **Sync now**.

The QR code is produced locally from the payload with the `qrcode` JavaScript package. The live and image scanners use ZXing locally. No QR payload, camera frame, or selected image is uploaded to a third-party service.

The invitation file uses:

```text
Extension: .elephantnote-invite
MIME: application/vnd.elephantnote.sync-invite+json
Content: the exact JSON invitation accepted by tauri_sync_accept_invite
```

A native share action always shares the file rather than publishing the credential at a web URL. When the Web Share API or file sharing is unavailable, ElephantNote downloads the same invitation file instead.

ElephantNote does not currently register an `elephantnote://` deep-link scheme. The default camera application therefore cannot tap a QR result and cold-start ElephantNote as a URL handler. Instead, ElephantNote provides a live scanner and a system-camera capture input inside the pairing flow. A future tap-to-open QR requires a registered and tested desktop/mobile protocol handler before the UI can expose it honestly.

The invitation is a temporary bearer credential and must not be logged, committed, indexed, or synchronized. Anyone who obtains it before expiration can attempt to pair, so the UI displays the remaining lifetime and clears the visible payload when the pairing dialog closes.

## QR and file validation

A focused CI workflow performs real round trips rather than checking only that UI controls exist:

- generate a PNG QR from a representative full Iroh invitation;
- decode it with an independent ZXing QR reader;
- require the decoded string to equal the source JSON byte-for-byte;
- decode the PNG data URL produced by the browser helper in the same way;
- create a real `.elephantnote-invite` `File`, read it back, and require identical content and MIME type;
- require QR, file, and pasted code to resolve to the exact same credential;
- pass every decoded/imported payload through the shared protocol, required-field, and expiration validator;
- reject malformed, incomplete, and expired payloads.

The dedicated focused workflow runs 17 Sync/invitation tests and persists its output as an artifact on every execution.

Physical camera hardware cannot be created in hosted unit CI. Camera acquisition remains covered by build/lint and integration contracts, while the actual codec used after each camera frame or captured photo is covered by the independent decode round trip.

## Sync settings information architecture

Settings → Sync is a single vertical page rather than a second settings application with `Overview`, `Devices`, and `Conflicts` tabs.

The order reflects the questions a normal user asks:

1. current synchronization result and the main action;
2. paired devices;
3. conflict protection and recovered copies;
4. advanced identifiers for diagnostics.

The page deliberately distinguishes **paired** from **online**. A stored peer is labeled `Paired`; it is not shown as connected or available unless the backend provides a real reachability signal. Iroh EndpointIds remain under the collapsed Advanced section.

Adding a device opens a dedicated pairing dialog. Creating and accepting invitations are separate modes, and file import supports both a file picker and drag and drop. No device removal or renaming control is displayed until corresponding backend commands exist.

## Synchronization algorithm

Each peer pair keeps its own last common manifest under:

```text
.elephantnote/sync/baselines/<endpoint-id>.json
```

A synchronization compares:

- current local content manifest;
- current remote content manifest;
- last common content manifest.

This three-way comparison handles:

- new files and folders;
- modifications;
- deletions;
- renames as delete plus create;
- concurrent modifications;
- edit-versus-delete conflicts.

## Conflict policy

When two different file versions were both changed since the common baseline:

1. both versions are preserved;
2. the version with the largest filesystem modification timestamp keeps the original vault path;
3. if both timestamps are equal, EndpointId ordering provides a deterministic tie-breaker;
4. the older/losing version is copied to `.conflit/`, preserving the original directory hierarchy;
5. the conflict copy is transferred to the other peer so both devices initially receive it.

Example:

```text
Notes/Project.md
.conflit/Notes/Project.<device>-conflict-<hash>-<mtime>.md
```

The `.conflit/` directory is not part of normal content manifests. This is deliberate: each device may use a different retention duration, and deleting an expired local archive must never propagate as a remote note deletion.

The default retention is **3 days**. It can be configured from Settings → Sync between 1 and 365 days. The setting is stored locally under `.elephantnote/sync/conflict-settings.json`, which is itself excluded from synchronization. Cleanup runs before local sync operations, status refreshes, settings reads/updates, and incoming Iroh sessions.

Modification timestamps are used only to choose which preserved version keeps the original path. They are never used as permission to discard the other version, so clock skew cannot cause data loss.

For edit-versus-delete conflicts, the edited content is preserved because the current protocol does not yet carry a timestamped deletion tombstone.

## Transfer protocol

- Control messages are length-prefixed JSON on one bidirectional QUIC stream.
- File data is sent on independent unidirectional QUIC streams.
- Files are read and written in 256 KiB chunks.
- Every transfer includes expected size and BLAKE3 hash.
- Incoming files are written to a `.syncpart` file, verified, and atomically renamed.
- Paths are validated as vault-relative paths and traversal is rejected.
- The receiving peer independently recomputes the synchronization plan.
- The baseline advances only after both final content manifests contain identical paths and content hashes.

## Important implementation rule

Do not replace this protocol with a shared-folder copy, fake success response, unregistered deep link, or smoke-only implementation. A successful sync result requires an authenticated Iroh peer connection and matching final content manifests.

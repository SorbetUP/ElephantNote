# ElephantNote Iroh vault synchronization

## Scope

The Iroh backend synchronizes the complete portable vault between explicitly paired ElephantNote devices. It includes normal notes, folders, `.assets`, `.config`, and portable `.elephantnote` data.

The following local/runtime paths are intentionally excluded:

- `.elephantnote/sync/` — peer identities, baselines, queues, and transfer state
- `.elephantnote/cache/` — rebuildable cache
- `.elephantnote/index/` — rebuildable search index
- `.git/`, `node_modules/`, OS metadata, editor temporary files, and symlinks

## Transport and identity

- Iroh endpoint identity is a persistent Ed25519 secret stored in the Tauri application config directory, outside every vault.
- The endpoint uses QUIC with the ALPN `elephantnote/vault-sync/1`.
- LAN address discovery uses `iroh-mdns-address-lookup` with the service name `elephantnote-v1`.
- The `Minimal` Iroh preset is used: no public relay or cloud service is required.
- Every accepted connection is authenticated by its Iroh `EndpointId`.

## Pairing

1. Device A creates a ten-minute invitation.
2. The invitation contains Device A's `EndpointAddr`, vault identifier, invitation identifier, and a random one-time token.
3. Only the BLAKE3 hash of the one-time token is persisted by Device A.
4. Device B connects over Iroh and sends the token on the encrypted connection.
5. Both devices persist the authenticated remote `EndpointId` as a trusted peer for that vault.

The invitation is a temporary bearer credential and must not be logged or committed.

## Synchronization algorithm

Each peer pair keeps its own last common manifest under:

```text
.elephantnote/sync/baselines/<endpoint-id>.json
```

A synchronization compares:

- current local manifest;
- current remote manifest;
- last common manifest.

This three-way comparison handles:

- new files and folders;
- modifications;
- deletions;
- renames as delete plus create;
- concurrent modifications;
- edit-versus-delete conflicts.

For concurrent file modifications, the original path gets a deterministic winner based on EndpointId ordering. The losing version is preserved as a sibling conflict file on both devices.

## Transfer protocol

- Control messages are length-prefixed JSON on one bidirectional QUIC stream.
- File data is sent on independent unidirectional QUIC streams.
- Files are read and written in 256 KiB chunks.
- Every transfer includes expected size and BLAKE3 hash.
- Incoming files are written to a `.syncpart` file, verified, and atomically renamed.
- Paths are validated as vault-relative paths and traversal is rejected.
- The baseline advances only after both final manifests contain identical paths and content hashes.

## Important implementation rule

Do not replace this protocol with a shared-folder copy, fake success response, or smoke-only implementation. A successful sync result requires an authenticated Iroh peer connection and matching final manifests.

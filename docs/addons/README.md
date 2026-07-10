# ElephantNote Addon SDK v1

ElephantNote external addons are user-installable `.enaddon` packages. API v1 exposes a deliberately small capability-based surface instead of internal Vue, Pinia, Muya or Tauri objects.

## Built-in addons

ElephantNote ships five compiled addons:

- **Daily Notes** creates a linked daily workspace with focus, tasks, notes and end-of-day review sections;
- **Quick Capture** creates timestamped `Inbox/` notes with an explicit `unprocessed` state;
- **Vault Overview** generates graph coverage, connected-note and orphan-note reports;
- **Addon Profiles** installs, updates, enables and disables official catalogue addons from `Addon Profiles/default.json`;
- **Addon Inspector** is a disabled-by-default developer reference for actions, settings and sidebar contributions.

Built-in addons do not require Community Addons mode. Addon Profiles cannot install arbitrary URLs or packages and enabling external addons through a profile still requires Community Addons consent.

## Official catalogue

The application loads its official catalogue from the dedicated `addon-catalog` branch. The branch contains only catalogue metadata and addon sources.

Current catalogue examples include:

- Task Dashboard;
- Broken Links Auditor;
- GitHub Release Watcher;
- Notion Markdown Importer;
- Inbox Digest;
- Finance Notes;
- Addon Platform Proof.

The Rust backend:

1. fetches the fixed catalogue URL;
2. rejects unsafe or cross-addon paths;
3. verifies catalogue metadata against the addon manifest;
4. downloads the declared manifest and Worker entry;
5. creates a temporary `.enaddon` archive;
6. passes it through the same package validator used for local files;
7. installs the addon disabled in the active vault.

The application does not accept arbitrary catalogue URLs. See `CATALOG.md`.

## Per-vault storage

Every initialized vault contains:

```text
.elephantnote/addons/
├── registry.json
├── packages/
│   └── <addon-id>/
└── data/
    └── <addon-id>/storage.json
```

Package files, enable state and private addon storage are scoped to the active vault. `.elephantnote` remains hidden from the normal explorer.

## Package format

An `.enaddon` package is a ZIP archive with `manifest.json` at its root.

```text
example.enaddon
├── manifest.json
├── main.js
└── assets/
    └── icon.svg
```

Limits:

- compressed package: 25 MiB;
- extracted package: 100 MiB;
- archive entries: 512;
- JavaScript entry: 5 MiB;
- symbolic links and archive traversal are rejected.

External addons are installed disabled.

## Community Addons mode

Community Addons mode is disabled by default and requires explicit risk acknowledgement. Turning it off stops every external addon without uninstalling packages or deleting private data.

Worker isolation and permission checks reduce risk but do not prove that third-party code is safe. Users should review the publisher, source and requested capabilities.

## Manifest

```json
{
  "id": "com.example.hello",
  "name": "Hello Notes",
  "version": "1.0.0",
  "apiVersion": 1,
  "minAppVersion": "0.18.9",
  "runtime": {
    "type": "javascript-worker",
    "entry": "main.js"
  },
  "permissions": {
    "commands": true,
    "storage": false,
    "notes": {
      "read": ["Inbox/**"],
      "write": ["Generated/**"]
    },
    "network": {
      "hosts": []
    }
  },
  "contributes": {
    "commands": [
      {
        "id": "com.example.hello.generate",
        "title": "Generate hello note"
      }
    ]
  }
}
```

Addon identifiers use lowercase ASCII letters, numbers, dots, dashes or underscores. Command identifiers must start with the addon identifier followed by a dot.

## Entry contract

The entry runs in a dedicated Web Worker and assigns `self.elephantAddon`.

```js
self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.example.hello.generate',
      title: 'Generate hello note',
      async run() {
        await api.notes.write('Generated/Hello.md', '# Hello\n')
        return { path: 'Generated/Hello.md' }
      }
    })
  }
}
```

`activate()` may return a cleanup function. Contributions are removed automatically when an addon is disabled.

## API v1

### Application metadata

```js
const info = await api.app.info()
```

Returns the ElephantNote version and addon API version.

### Commands

Requires `permissions.commands: true`.

```js
const unregister = api.commands.register({
  id: 'com.example.addon.refresh',
  title: 'Refresh generated report',
  async run(payload) {
    return { ok: true, payload }
  }
})
```

The Addons settings page runs commands without a payload. Other internal invocation surfaces may provide one.

### Notes

All paths are relative to the active vault and checked in Rust against the manifest scopes.

```js
const inboxEntries = await api.notes.list('Inbox')
const allVisibleNotes = await api.notes.list('.')
const note = await api.notes.read(inboxEntries[0].path)
await api.notes.write('Generated/Report.md', '# Report\n')
```

`notes.list(prefix)`:

- requires a matching read scope;
- accepts `.` as the vault-root sentinel only when the manifest declares `read: ["*"]`;
- returns only Markdown files;
- does not follow symbolic links;
- excludes hidden files and directories, including `.elephantnote`;
- is limited to 1,000 notes and 64 directory levels;
- returns `path`, `size` and `modifiedAt` metadata.

Scopes can target a file, a directory tree, or the whole visible vault:

```json
{
  "read": ["Reference/README.md", "Inbox/**"],
  "write": ["Generated/**"]
}
```

`*` grants access to every visible relative Markdown path and should be avoided unless an addon genuinely requires vault-wide analysis.

### HTTPS

The Worker has no direct `fetch`, `WebSocket`, `XMLHttpRequest` or Tauri bridge. Requests use the Rust broker.

```js
const response = await api.http.request({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: { Accept: 'application/json' }
})

if (!response.ok) throw new Error(`HTTP ${response.status}`)
const data = JSON.parse(response.body)
```

Every hostname must be declared exactly or with a subdomain wildcard:

```json
{
  "hosts": ["api.example.com", "*.market.example.com"]
}
```

The broker:

- accepts HTTPS on port 443 only;
- rejects URL credentials;
- resolves the hostname and pins the request to a checked public address;
- blocks loopback, private, link-local, multicast, documentation and other special-use addresses;
- blocks private IPv4 represented as IPv6;
- disables automatic redirects and revalidates every GET redirect;
- permits at most five redirects;
- limits request bodies to 1 MiB and responses to 5 MiB;
- applies a 30-second request timeout.

### Private storage

Requires `permissions.storage: true`.

```js
await api.storage.set('settings', { symbols: ['AAPL'] })
const settings = await api.storage.get('settings')
const allValues = await api.storage.entries()
await api.storage.remove('settings')
```

Storage is namespaced under `.elephantnote/addons/data/<addon-id>/storage.json` and limited to 1 MiB per addon.

## Worker isolation

External addons do not receive:

- the DOM;
- Vue or Pinia;
- the router or private application services;
- Muya internals;
- direct filesystem APIs;
- the Tauri bridge;
- direct browser networking APIs.

All privileged operations are checked again by an application broker or in Rust.

## Lifecycle and failures

- installation validates and extracts into a staging directory;
- package replacement uses rollback if registry persistence fails;
- Community Addons consent is checked before activation and startup restoration;
- activation timeout: 10 seconds;
- command timeout: 60 seconds;
- a timed-out Worker is terminated;
- activation and command errors are surfaced in Settings and diagnostics logs.

## Build an addon

```bash
node build/scripts/package-addon.mjs path/to/addon build/my-addon.enaddon
```

Then use **Settings → Addons → Install from file**.

Validate a catalogue checkout with:

```bash
node build/scripts/validate-addon-catalog.mjs path/to/addon-catalog
```

## Deliberately not implemented in API v1

- scheduled or background jobs;
- Python or WASM compute runtimes;
- custom panels and iframe views;
- Muya editor extensions;
- secrets or keychain access;
- native Apple Calendar or Apple Notes bridges;
- OAuth-based service connectors;
- publisher signatures.

These capabilities must be added through explicit, permissioned API versions rather than by exposing application internals. See `CONNECTOR_ROADMAP.md` for the concrete requirements for Apple Calendar, Apple Notes, direct Notion synchronization, email ingestion and Muya 3D blocks.

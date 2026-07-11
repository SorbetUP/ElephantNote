# ElephantNote Addon SDK v1

ElephantNote external addons are user-installable `.enaddon` packages. API v1 exposes a capability-based Worker surface for isolated addons and an explicit full-application runtime for addons that need to modify ElephantNote itself.

## Addon-first application model

ElephantNote keeps a small core and exposes optional application features as independently enabled addons. The built-in catalogue currently includes:

- **Addon Packs** captures and reapplies a complete addon setup, including built-in, official catalogue and already-installed local addons;
- **Google Keep Import** owns Google Keep, web-page and RSS import controls;
- **Codex Connection** owns ChatGPT subscription connection, account state, usage limits and the Codex provider contribution;
- **Calendar** owns calendar integration;
- **Sites** owns static-site generation and preview controls;
- **Daily Notes** creates a linked daily workspace with focus, tasks, notes and end-of-day review sections;
- **Quick Capture** creates timestamped `Inbox/` notes with an explicit `unprocessed` state;
- **Vault Overview** generates graph coverage, connected-note and orphan-note reports;
- **Addon Inspector** is a disabled-by-default developer reference.

Import, Codex and Sites keep their Vue interfaces inside their addon modules. Their Settings categories exist only while the corresponding addon is enabled.

Built-in addons do not require Community Addons mode. Third-party addons always require the single global Community Addons acknowledgement.

## Addon packs

Addon Packs uses the portable `elephantnote-addon-pack` format. The default pack is stored at:

```text
.elephantnote/addons/packs/default.enaddonpack
```

Example:

```json
{
  "format": "elephantnote-addon-pack",
  "version": 1,
  "name": "Writing workspace",
  "description": "Daily writing, capture and publishing tools.",
  "addons": [
    { "id": "elephant.daily-notes", "source": "builtin", "enabled": true },
    { "id": "elephant.quick-capture", "source": "builtin", "enabled": true },
    { "id": "com.example.publisher", "source": "catalog", "version": "1.2.0", "enabled": true }
  ]
}
```

Supported sources:

- `builtin`: a feature shipped with ElephantNote;
- `catalog`: an addon installed or updated from the fixed official catalogue;
- `installed`: a local package that must already exist in the vault.

Applying a pack never bypasses the global Community Addons switch. Full-app-access packages use the same ordinary addon switch and pack application path as other community addons.

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
├── packs/
│   └── default.enaddonpack
└── data/
    └── <addon-id>/storage.json
```

Package files, enable state, packs and private addon storage are scoped to the active vault. `.elephantnote` remains hidden from the normal explorer.

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

Community Addons mode is disabled by default and requires one explicit risk acknowledgement. Turning it off stops every external addon without uninstalling packages or deleting private data.

After Community Addons is enabled, every package uses its ordinary enable switch. There is no second visible review flow or permanent full-app-access safe-mode setting.

Worker isolation and permission checks reduce risk but do not prove that third-party code is safe. Full-app-access addons intentionally run inside ElephantNote and can change the DOM, editor and application behavior.

## Access models

### Limited access

The entry runs in a dedicated Web Worker and receives only the public capability API. It cannot directly access Vue, Pinia, the DOM, Muya, Tauri or browser networking.

### Full app access

A package opts in with:

```json
{
  "contributes": {
    "runtimeMode": "trusted"
  }
}
```

It is loaded in the ElephantNote renderer and can use the full addon host, including application resources, DOM integration, routes, editor and Markdown contributions, settings pages and reversible patches. This mode is deliberately comparable to installing a powerful desktop plugin: the user must trust the package.

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

## Isolated Worker entry contract

The entry assigns `self.elephantAddon`.

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

External isolated addons do not receive:

- the DOM;
- Vue or Pinia;
- the router or private application services;
- Muya internals;
- direct filesystem APIs;
- the Tauri bridge;
- direct browser networking APIs.

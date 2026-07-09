# ElephantNote Addon SDK v1

ElephantNote external addons are user-installable `.enaddon` packages. Version 1 deliberately exposes a small capability-based API instead of internal Vue, Pinia, Muya or Tauri objects.

## Package format

An `.enaddon` package is a ZIP archive with `manifest.json` at its root.

```text
example.enaddon
├── manifest.json
├── main.js
└── assets/
    └── icon.svg
```

Current package limits:

- compressed package: 25 MiB maximum;
- extracted package: 100 MiB maximum;
- 512 archive entries maximum;
- JavaScript entry: 5 MiB maximum;
- symbolic links and archive path traversal are rejected.

External addons are installed disabled. The user reviews their declared capabilities before enabling them.

## Minimal manifest

```json
{
  "$schema": "../../../docs/addons/manifest.schema.json",
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
      "read": [],
      "write": ["Generated/**"]
    },
    "network": {
      "hosts": []
    }
  }
}
```

Addon identifiers must use lowercase ASCII letters, numbers, dots, dashes or underscores. Command identifiers must start with the addon identifier followed by a dot.

## Entry contract

The entry file runs in a dedicated Web Worker. It must assign an addon definition to `self.elephantAddon`.

```js
self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.example.hello.create-note',
      title: 'Create hello note',
      async run() {
        await api.notes.write('Generated/Hello.md', '# Hello\n')
      }
    })
  },

  async deactivate(api) {
    // Optional cleanup that requires asynchronous work.
  }
}
```

`activate()` may return a cleanup function. Registered contributions are also removed automatically when the addon is disabled.

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
  title: 'Refresh generated note',
  description: 'Fetch and regenerate the note.',
  async run(payload) {
    return { ok: true }
  }
})
```

### Notes

Every path is relative to the active vault and checked against the manifest scopes.

```js
const note = await api.notes.read('Finance/AAPL.md')
await api.notes.write('Finance/AAPL.md', '# AAPL\n')
```

Scopes can target one file, a directory tree, or the whole vault:

```json
{
  "read": ["Reference/README.md", "Research/**"],
  "write": ["Generated/**"]
}
```

`*` grants access to all relative paths and should be avoided unless genuinely necessary.

### HTTPS

The Worker has no direct `fetch`, `WebSocket`, `XMLHttpRequest` or Tauri bridge. Network access goes through the Rust broker.

```js
const response = await api.http.request({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: {
    Accept: 'application/json'
  }
})

if (!response.ok) throw new Error(`HTTP ${response.status}`)
const data = JSON.parse(response.body)
```

Every initial hostname must be declared exactly or with a subdomain wildcard:

```json
{
  "hosts": ["api.example.com", "*.market.example.com"]
}
```

Only HTTPS is accepted. The response body is limited to 5 MiB and requests time out after 30 seconds.

The current preview broker still follows a limited number of redirects. Consequently, network permissions are not yet considered production-hardened: redirect targets, DNS resolution to private addresses and localhost access must be blocked before community network addons can be enabled by default. Until that hardening lands, install and enable only reviewed packages from trusted authors.

### Private storage

Requires `permissions.storage: true`. Storage is namespaced by addon and is not stored in the vault.

```js
await api.storage.set('settings', { symbol: 'AAPL' })
const settings = await api.storage.get('settings')
const allValues = await api.storage.entries()
await api.storage.remove('settings')
```

The current storage quota is 1 MiB per addon.

## Worker isolation

External addons do not receive:

- the DOM;
- Vue or Pinia instances;
- the application router or private services;
- Muya internals;
- direct filesystem APIs;
- the Tauri command bridge;
- direct browser networking APIs.

All privileged operations are checked again in Rust. Worker isolation protects the main interface from crashes and blocks accidental access to application internals, but community code must still be treated as third-party code and reviewed before installation.

## Lifecycle and failures

- installation validates and extracts into a staging directory;
- a package update replaces the previous package with rollback on registry failure;
- activation has a 10-second timeout;
- addon commands have a 30-second timeout;
- a timed-out Worker is terminated;
- activation errors are displayed in Settings → Addons;
- enable/disable state is persisted across application restarts.

## Build an addon

```bash
cd path/to/addon
zip -r example.enaddon manifest.json main.js assets
```

Then use **Settings → Addons → Install from file**.

See `examples/addons/finance-notes` for a complete HTTP → transform → Markdown pipeline.

## Deliberately not implemented in API v1

The following capabilities are not represented as working features yet:

- scheduled/background jobs;
- Python or WASM compute runtimes;
- custom panels and iframe views;
- Muya editor extensions;
- secrets/keychain access;
- signed marketplace packages and automatic updates.

They should be added as explicit, permissioned API versions rather than by exposing application internals.

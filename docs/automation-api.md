# Elephant Automation API

Elephant exposes an opt-in, loopback-only HTTP API for tests, local agents and LLM tooling. It controls the real Tauri application and its mounted renderer; it does not launch a second browser or a synthetic copy of the interface.

## Enable it

Start Elephant with:

```bash
ELEPHANT_AUTOMATION_PORT=0 \
ELEPHANT_AUTOMATION_TOKEN="$(openssl rand -hex 32)" \
./Elephant
```

`0` asks the operating system to choose a free port. Elephant prints:

```text
ELEPHANT_AUTOMATION_PORT=43127
```

The server binds only to `127.0.0.1`. Every endpoint except health requires the token through either:

```text
Authorization: Bearer <token>
X-Elephant-Automation-Token: <token>
```

Do not enable this API for a normal user session unless a local automation client needs it.

## Protocol

The stable API prefix is `/v1`.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Process, renderer readiness and protocol version |
| `GET /v1/schema` | Endpoint inventory |
| `GET /v1/capabilities` | Commands currently exposed by the mounted renderer |
| `GET /v1/ui?selector=body` | Bounded semantic UI snapshot, bounds, attributes and computed visibility |
| `GET /v1/logs` | Structured renderer/application logs with `level`, `contains`, `since` and `limit` filters |
| `POST /v1/command` | Execute one renderer/application command |
| `POST /v1/batch` | Execute 1–100 commands sequentially and fail at the exact command index |

Example command:

```json
{
  "command": "assertUi",
  "args": [
    {
      "selector": ".en-settings-panel",
      "exists": true,
      "visible": true,
      "textIncludes": "Autosave"
    }
  ]
}
```

Example batch:

```json
{
  "commands": [
    { "command": "click", "args": ["[aria-label=Settings]"] },
    { "command": "waitFor", "args": [".en-settings-panel", 10000] },
    { "command": "assertLogs", "args": [{ "level": "error", "maxCount": 0, "minCount": 0 }] }
  ]
}
```

## Node client

The repository includes `build/scripts/elephant-automation-client.mjs`.

```bash
export ELEPHANT_AUTOMATION_ENDPOINT=http://127.0.0.1:43127
export ELEPHANT_AUTOMATION_TOKEN=...

node build/scripts/elephant-automation-client.mjs capabilities
node build/scripts/elephant-automation-client.mjs ui body '{"nodeLimit":150}'
node build/scripts/elephant-automation-client.mjs logs '{"level":"error","limit":100}'
node build/scripts/elephant-automation-client.mjs command click '["[aria-label=Settings]"]'
```

A JSON argument beginning with `@` is loaded from a file.

## Available control surfaces

The capabilities response is authoritative. The standard bridge includes:

- DOM interaction: `readDom`, `queryAll`, `uiSnapshot`, `click`, `contextClick`, `fill`, `press`, `selectText`, `insertText`, `waitFor`, `waitUntilGone`;
- assertions: `assertUi`, `assertLogs`;
- observability: `logs`, `clearLogs`, `readState`, `readDisplayed`;
- notes and vaults: `selectVault`, `listNotes`, `readNote`, `createNote`, `openNote`, `setMarkdown`, `appendMarkdown`, `save`;
- Tauri and application commands: `invokeTauri`, `executeCommand`;
- add-ons: installation, activation, deactivation, actions, resources and native service calls;
- Excalidraw state and lifecycle.

The API returns semantic DOM state rather than screenshots by default. This makes assertions stable across DPI, window decoration and font rasterization while still proving what is mounted, visible, labelled and displayed. Visual screenshot comparison can remain a separate optional diagnostic rather than the source of truth for functional tests.

## Compatibility

`ELEPHANT_ACCEPTANCE_TAURI_PORT`, `/health` and `/command` remain accepted temporarily for older test runners. New integrations must use `ELEPHANT_AUTOMATION_PORT` and `/v1`.

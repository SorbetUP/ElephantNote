# Subscription-backed AI providers

ElephantNote integrates subscription-backed coding models through the official local runtimes that own their authentication lifecycle. It does not copy browser cookies, scrape private tokens, or present an unrelated OpenAI-compatible endpoint as Codex.

## Machine-zero behavior

Codex and OpenCode do not need to be preinstalled globally.

On the first provider action that needs a runtime — Connect, Test, or chat generation — ElephantNote:

1. checks its managed runtime directory;
2. reuses a valid managed or system installation when one exists;
3. otherwise reads the latest official GitHub release metadata;
4. selects the asset matching the current operating system and architecture;
5. rejects unexpected archive formats and oversized assets;
6. verifies the exact download size and the release SHA-256 digest;
7. extracts only the expected executable from the archive;
8. validates the executable with `--version` before activating it;
9. stores the binary and an installation manifest under the ElephantNote application data directory.

The installer does not write to a system package directory and does not require administrator privileges. Managed binaries are exposed only to the current ElephantNote process.

## Codex

ElephantNote installs or reuses the official Codex CLI and starts:

```text
codex app-server --listen stdio://
```

It then performs the JSONL handshake:

1. `initialize`
2. `initialized`
3. `account/read`, `account/login/start`, or `model/list`
4. `thread/start`
5. `turn/start`

The Codex process owns ChatGPT authentication and token refresh. ElephantNote only receives account status, plan metadata, model metadata, and conversation events.

The settings page derives its connected state from `account/read`; it does not toggle a local boolean. The chat model list comes from `model/list`; it does not contain a hard-coded Codex model. Selecting one of those models routes `rag.chat` through a real Codex thread and subsequent turns reuse that thread for the conversation.

Codex turns currently use a serialized app-server reader. The response and protocol events are real, but the renderer receives the completed turn rather than live deltas. Concurrent Codex interruption is therefore rejected explicitly until the backend has a dedicated event dispatcher. Approval requests are denied by default rather than being silently accepted.

## OpenCode

For the default local endpoint, ElephantNote installs or reuses the official OpenCode executable and starts:

```text
opencode serve --hostname 127.0.0.1 --port 4096
```

ElephantNote waits for `GET /global/health` to become healthy before using the service. The managed child process is tracked and stopped with ElephantNote. A user-configured non-default loopback endpoint remains supported and is treated as an externally managed OpenCode server.

Provider authentication remains owned by OpenCode. ElephantNote uses the OpenCode server endpoints:

- `GET /global/health`
- `GET /provider`
- `GET /config/providers`
- `POST /session`
- `POST /session/:id/message`
- `POST /session/:id/abort`

The OpenCode provider test verifies the local server and imports its real model catalog. Selecting an imported OpenCode model routes the ElephantNote chat through a real OpenCode session. Remote endpoints are rejected by default. Optional HTTP basic-auth credentials are sent only to the configured loopback server and are never written to logs.

## Managed runtime layout

The exact platform path is resolved through Tauri's application-data directory. The logical layout is:

```text
<app-data>/runtimes/
  codex/
    bin/codex[.exe]
    install.json
  opencode/
    bin/opencode[.exe]
    install.json
```

Each `install.json` records the source repository, release tag, asset name, verified SHA-256 digest, and installation timestamp.

## Renderer API

The Tauri bridge exposes runtime lifecycle operations:

- `ai.runtimes.status`
- `ai.runtimes.install`
- `ai.runtimes.ensure`
- `ai.runtimes.stop`

It also exposes provider operations:

- `ai.providers.status`
- `ai.auth.status`
- `ai.auth.login.start`
- `ai.auth.login.cancel`
- `ai.auth.logout`
- `ai.models.list`
- `ai.threads.start`
- `ai.turns.start`
- `ai.turns.interrupt`

`ai.turns.interrupt` is functional for OpenCode. For Codex it currently returns an explicit unsupported-operation error instead of pretending that a serialized request can interrupt the active turn.

Direct provider helpers are available under `elephantnote.ai.codex` and `elephantnote.ai.opencode`. The existing `elephantnote.rag.chat` method dispatches to these runtimes when the selected chat route uses `codex` or `opencode`; all other providers continue through the pre-existing chat runtime.

## Development logs

`pnpm tauri:dev` prints installation and lifecycle activity, for example:

```text
[AI][runtime] install:release provider=codex repository=openai/codex
[AI][runtime] install:download provider=codex release=... asset=... bytes=...
[AI][runtime] install:complete provider=codex release=... executable=... version=...
[AI][codex] process:start executable=...
[AI][codex] protocol:initialized pid=... version=...
[AI][opencode] process:start executable=... endpoint=http://127.0.0.1:4096
[AI][opencode] process:ready pid=... endpoint=http://127.0.0.1:4096 duration_ms=...
```

Fields whose names contain token, API key, authorization, or password are redacted before process output is logged.

## Tests

The Rust tests cover JSONL response correlation, notification handling, approval denial, text-delta assembly, loopback enforcement, release-asset selection, archive restrictions, provider-specific paths, managed process state, and log redaction. When the official Codex CLI is installed in the test environment, an additional test performs a real app-server handshake and `account/read` request.

Renderer tests verify that:

- the real Tauri provider commands are called;
- provider status first ensures the managed runtime exists;
- Codex and OpenCode chats create real runtime threads and turns;
- the same conversation reuses its runtime thread;
- `api.call('rag.chat', ...)` reaches the subscription bridge rather than `tauri_rag_chat`;
- non-subscription providers remain delegated to the existing runtime;
- the former fake Codex toggle and hard-coded model do not return.

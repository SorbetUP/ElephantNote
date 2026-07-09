# Subscription-backed AI providers

ElephantNote integrates subscription-backed coding models through the official local runtimes that own their authentication lifecycle. It does not copy browser cookies, scrape private tokens, or present an unrelated OpenAI-compatible endpoint as Codex.

## Codex

Requirements:

- Install the official `codex` CLI.
- Keep `codex` available in `PATH`.
- Connect from ElephantNote using the browser or device-code login flow.

ElephantNote starts `codex app-server --listen stdio://` and performs the required JSONL handshake:

1. `initialize`
2. `initialized`
3. `account/read`, `account/login/start`, or `model/list`
4. `thread/start`
5. `turn/start`

The Codex process owns ChatGPT authentication and token refresh. ElephantNote only receives account status, plan metadata, model metadata, and conversation events.

Codex turns currently use a serialized app-server reader. The response and protocol events are real, but the renderer receives the completed turn rather than live deltas. Concurrent Codex interruption is therefore rejected explicitly until the backend has a dedicated event dispatcher. Approval requests are denied by default rather than being silently accepted.

## OpenCode

Requirements:

- Start `opencode serve` or an OpenCode TUI with a known port.
- Connect providers through OpenCode itself.
- Use a loopback HTTP endpoint, normally `http://127.0.0.1:4096`.

ElephantNote uses the documented OpenCode server endpoints:

- `GET /global/health`
- `GET /provider`
- `GET /config/providers`
- `POST /session`
- `POST /session/:id/message`
- `POST /session/:id/abort`

Remote OpenCode endpoints are rejected by default. Optional OpenCode HTTP basic-auth credentials are sent only to the configured loopback server and are never written to logs.

## Renderer API

The Tauri bridge exposes:

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

Direct provider helpers are also available under `elephantnote.ai.codex` and `elephantnote.ai.opencode`.

## Development logs

`pnpm tauri:dev` prints runtime lifecycle and protocol activity, for example:

```text
[AI][codex] process:start executable=/path/to/codex
[AI][codex] protocol:initialized pid=1234 version=...
[AI][codex] request:start id=2 method=account/read
[AI][codex] request:complete id=2 method=account/read duration_ms=... notifications=...
[AI][codex] turn:complete turn_id=... chars=... events=...
```

Fields whose names contain token, API key, authorization, or password are redacted before stderr is logged.

## Tests

The Rust tests cover JSONL response correlation, notification handling, approval denial, text-delta assembly, loopback enforcement, model references, and log redaction. When the official Codex CLI is installed in the test environment, an additional test performs a real app-server handshake and `account/read` request.

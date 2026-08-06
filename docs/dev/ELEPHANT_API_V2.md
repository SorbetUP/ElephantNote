# Elephant API contract v2

The renderer-facing Elephant API is the only supported boundary for portable feature code.
Platform-specific bridges remain implementation adapters and must not be called from domain clients.

## Public entry point

```js
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
```

Every request uses a canonical action and a plain-object payload. Errors use the common
`{ ok, version, action, data, error }` envelope at the platform boundary.

## Domains

- `vaults`, `directory`, `notes`, `folders`, `sidebar`, `entries`
- `attachments`, `drawings`
- `calendar`, `sources`, `wiki`, `search`, `rag`
- `ai`, `models`, `atomic`, `atomicFeatures`
- `markdown`, `editorEngine` (`muya` remains a compatibility alias)
- `sync`, `sitePreview`, `ocr`
- `agents`, `plugins`, `tasks`, `mcp`, `programs`

## Provider-neutral integrations

Platform names do not define the public operation:

```js
elephantnoteClient.calendar.sync('google')
elephantnoteClient.models.search({ provider: 'huggingface', query: 'embedding' })
elephantnoteClient.models.download({ uri: 'hf:org/model/model.gguf' })
```

Google Calendar, Hugging Face, local model runtimes and Atomic legacy methods are translated
inside `platformCompatibilityAdapter.js`. Adding a provider means extending that adapter or a
native backend adapter, not adding a new provider-specific renderer call.

## Markdown and editor engine

Deterministic Markdown and editor operations are exposed through the same API:

```js
await elephantnoteClient.markdown.parse(markdown)
await elephantnoteClient.editorEngine.moveCursor(markdown, cursor, 'right')
await elephantnoteClient.editorEngine.undo(state)
await elephantnoteClient.editorEngine.updateComposition(state, text)
```

The contract covers parsing, rendering, frontmatter, links, clipboard operations, undo/redo,
cursor navigation, input rules, tables, image selection, composition and editor snapshots.
The UI host may render the legacy editor component, but domain code must use these contract
methods for cross-platform behavior.

## Attachments and drawings

Vault assets use the same API boundary:

```js
await elephantnoteClient.attachments.writeText('imports/readme.txt', content)
const drawing = await elephantnoteClient.drawings.create('Architecture')
await elephantnoteClient.drawings.write(drawing.relativePath, scene)
```

Paths and scene payloads are validated before transport. The platform adapter maps these actions
to the existing Tauri attachment and drawing commands without exposing those command names to UI
components.

## Compatibility policy

- `legacyCalls.js` is removed.
- `Elephant/front/app` must not call `window.__TAURI__` or raw `core.invoke`.
- The API caller tries the versioned backend first.
- Compatibility fallback is allowed only for an unknown or unavailable action.
- Real backend errors are never hidden by a fallback.
- Tauri installs `tauriApiContractFacade.js`, which advertises the complete v2 action list and
  normalizes synchronous or asynchronous backend descriptions.
- Existing provider-specific method names remain aliases only where UI compatibility requires it.

## Adding an action

1. Add the action and payload validator to `Elephant/shared/apiContractsV2.js`.
2. Add the public method to a focused client module.
3. Add or extend the platform adapter.
4. Add the action to the exhaustive contract matrix.
5. Add validation, failure, fallback and architecture tests.
6. Do not add a direct platform call to a component, store or domain client.

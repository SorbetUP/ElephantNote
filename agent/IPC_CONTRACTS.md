# Contrats IPC ElephantNote

## Fichier de reference

Tout contrat renderer/main commence dans:

```txt
src/preload/index.js
```

Le renderer utilise `window.elephantnote`. Le preload route vers `ipcRenderer.invoke`. La logique doit etre implementee cote main process.

## API unifiee (nouveau standard)

ElephantNote utilise desormais une API unifiee via `window.elephantnote.api.call(action, payload)`. Cette API centralise toutes les actions avec validation de schema, versioning (`2026-05-24`), et gestion d'erreurs standardisee.

```js
// Appel unifie
window.elephantnote.api.call('vaults.get', {})
window.elephantnote.api.call('notes.create', { relativePath: 'New.md' })
window.elephantnote.api.call('rag.chat', { message: '...', limit: 6 })

// Description de l'API
window.elephantnote.api.describe() // { version, actions: [...] }
```

Les appels legacy (`window.elephantnote.getVaults()`, etc.) restent supportes mais le client renderer (`elephantnoteClient.js`) utilise l'API unifiee en priorite.

Actions disponibles (60+):

| Namespace | Actions |
|---|---|
| `vaults` | `get`, `select`, `setActive` |
| `directory` | `list` |
| `notes` | `create`, `autotag` |
| `folders` | `create` |
| `sidebar` | `attach`, `detach` |
| `entries` | `rename`, `delete` |
| `import` | `googleKeep`, `googleKeepFromPaths` |
| `calendar` | `list`, `importGoogle`, `importGoogleFromPath`, `google.config.get`, `google.config.set`, `google.sync` |
| `sources` | `list`, `ingestUrl`, `importRss` |
| `wiki` | `list`, `propose`, `accept`, `dismiss` |
| `search` | `initVault`, `query`, `status`, `inspect`, `rebuild`, `clear`, `disable`, `enable` |
| `sites` | `previewFolder`, `buildFolder`, `stop`, `status`, `openExternal` |
| `agents` | `list`, `register`, `unregister`, `send` |
| `rag` | `chat` |
| `mcp` | `tools.list`, `tools.call` |
| `ai` | `config.get`, `config.set` |
| `features` | `get`, `set` |
| `atomic` | `catalog.get` |
| `models` | `selection.get`, `selection.set`, `local.list`, `download` |
| `plugins` | `list`, `set`, `run` |
| `tasks` | `list`, `set`, `run` |
| `programs` | `list`, `set`, `run` |
| `sync` | `status`, `enqueue`, `run` |

## API vault (legacy)

```js
window.elephantnote.getVaults()
window.elephantnote.selectVault()
window.elephantnote.setActiveVault(vaultId)
window.elephantnote.listDirectory(relativePath)
```

Usage:

- Charger les vaults au demarrage.
- Selectionner ou changer de vault.
- Lister un dossier relatif au vault actif.

Regles:

- `relativePath` doit rester relatif au vault.
- Ne jamais faire confiance au chemin venant du renderer.
- Normaliser et verifier cote main process.

## API notes et dossiers (legacy)

```js
window.elephantnote.createNote({ relativePath })
window.elephantnote.createFolder({ relativePath })
window.elephantnote.renameEntry({ relativePath, title })
window.elephantnote.deleteEntry({ relativePath })
```

Retour attendu:

- Une liste `entries` rafraichie.
- Eventuellement `workspace` si la sidebar est affectee.
- Eventuellement `note` avec `path`, `title`, `fullPath`.

## API sidebar (legacy)

```js
window.elephantnote.attachSidebarEntry(payload)
window.elephantnote.detachSidebarEntry(payload)
```

`payload` minimal:

```js
{
  relativePath: 'Folder/Note.md',
  title: 'Note',
  type: 'note'
}
```

## API import (legacy)

```js
window.elephantnote.importGoogleKeep()
```

Le portage Blinko peut ajouter d'autres imports, mais chaque import doit rester derriere une API explicite.

## API recherche

```js
window.elephantnote.search.initVault(vaultPath)
window.elephantnote.search.query({ query, mode, limit })
window.elephantnote.search.status()
window.elephantnote.search.inspect()
window.elephantnote.search.rebuild()
window.elephantnote.search.clear()
window.elephantnote.search.disable()
window.elephantnote.search.enable()
```

Modes connus:

- `smart`
- `exact`
- `semantic`

## API site preview

```js
window.elephantnote.sitePreview.previewFolder(params)
window.elephantnote.sitePreview.buildFolder(params)
window.elephantnote.sitePreview.stop(siteId)
window.elephantnote.sitePreview.status(siteId)
window.elephantnote.sitePreview.openExternal(url)
```

## API agents

```js
window.elephantnote.agents.list()
window.elephantnote.agents.register({ id, name, endpoint, model, apiKey, transport, capabilities })
window.elephantnote.agents.unregister(id)
window.elephantnote.agents.send({ agentId, message })
```

Transport par defaut: `openai-compatible`. Les agents sont memoires en RAM (Map) cote main process.

## API RAG

```js
window.elephantnote.rag.chat(message, limit)
```

Reponses ancreees dans le vault actif avec citations de notes locales.

## API MCP

```js
window.elephantnote.mcp.listTools()
window.elephantnote.mcp.callTool(name, arguments)
```

## API modeles

```js
window.elephantnote.models.getSelection()
window.elephantnote.models.setSelection(selection)
window.elephantnote.models.listLocal()   // Ollama
window.elephantnote.models.download({ id })
```

## API plugins/taches/programmes

```js
window.elephantnote.plugins.list()
window.elephantnote.plugins.set(payload)
window.elephantnote.plugins.run({ id, input })

window.elephantnote.tasks.list()
window.elephantnote.tasks.set(payload)
window.elephantnote.tasks.run({ id })

window.elephantnote.programs.list()
window.elephantnote.programs.set({ environments })
window.elephantnote.programs.run({ id, command, cwd })
```

## API sync Git

```js
window.elephantnote.sync.status()
window.elephantnote.sync.enqueue({ operation, payload })
window.elephantnote.sync.run()
```

## Ajouter un nouveau contrat

1. Ajouter la fonction dans `src/preload/index.js` (ou preferer l'API unifiee).
2. Ajouter le handler IPC cote main process.
3. Ajouter l'action dans `src/main/elephantnote/api.js` et `apiSchemas.js`.
4. Appeler le contrat depuis `elephantnoteClient.js` ou un store renderer.
5. Documenter la signature ici.
6. Tester le chemin nominal et au moins un cas d'erreur si le disque est touche.


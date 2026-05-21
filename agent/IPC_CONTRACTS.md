# Contrats IPC ElephantNote

## Fichier de reference

Tout contrat renderer/main commence dans:

```txt
src/preload/index.js
```

Le renderer utilise `window.elephantnote`. Le preload route vers `ipcRenderer.invoke`. La logique doit etre implementee cote main process.

## API vault

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

## API notes et dossiers

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

## API sidebar

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

## API import

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

## Ajouter un nouveau contrat

1. Ajouter la fonction dans `src/preload/index.js`.
2. Ajouter le handler IPC cote main process.
3. Appeler le contrat depuis un store ou un service renderer.
4. Documenter la signature ici.
5. Tester le chemin nominal et au moins un cas d'erreur si le disque est touche.


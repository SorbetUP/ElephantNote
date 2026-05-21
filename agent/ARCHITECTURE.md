# Architecture ElephantNote

## Vue d'ensemble

ElephantNote est une app Electron/Vue construite sur un socle MarkText. Le projet garde le moteur Markdown existant, mais remplace l'experience produit par une interface de notes locale.

Les responsabilites sont separees en trois couches:

- Main process Electron: acces disque, vaults, workspace local, recherche, preview.
- Preload: contrat securise expose au renderer.
- Renderer Vue: UI, stores Pinia, interaction utilisateur.

## Runtime

```txt
Electron main
  src/main/index.js
  src/main/app/*
  src/main/elephantnote/*
        ^
        | ipcRenderer.invoke / ipcMain.handle
        v
Preload
  src/preload/index.js
        ^
        | window.elephantnote / window.fileUtils / window.path
        v
Renderer Vue
  src/renderer/src/pages/app.vue
  src/renderer/src/elephantnote/*
  src/renderer/src/components/editorWithTabs
  src/muya/lib/*
```

## Principes de separation

- Le renderer ne lit pas directement le disque pour les operations de vault.
- Le preload ne contient pas de logique metier: il expose des fonctions et route vers IPC.
- Le main process valide les chemins et garde les operations dans le vault actif.
- Les stores Pinia gardent l'etat UI partage.
- Les composants Vue ne doivent pas connaitre les details IPC si un store peut les porter.
- Les helpers purs vont dans `utils/`.

## Donnees de vault

Un vault est un dossier utilisateur. ElephantNote y ajoute un dossier interne:

```txt
<vault>/
  .elephantnote/
    workspace.json
    index.json
  Getting Started/
  *.md
```

`workspace.json` contient la navigation attachee a la sidebar. Les notes restent des fichiers Markdown avec frontmatter.

## Frontmatter

Format attendu:

```md
---
title: "Welcome"
type: "note"
tags: ["getting-started"]
createdAt: "2026-05-21T00:00:00.000Z"
updatedAt: "2026-05-21T00:00:00.000Z"
---

# Welcome
```

Les helpers principaux sont:

- `src/main/elephantnote/core.js`: creation et parsing cote main.
- `src/renderer/src/elephantnote/utils/noteDocument.js`: transformation document <-> editeur.
- `src/renderer/src/elephantnote/utils/markdownTags.js`: gestion des tags.

## Editeur Markdown

L'editeur visible dans ElephantNote utilise encore les composants MarkText:

- `src/renderer/src/components/editorWithTabs`
- `src/muya/lib`
- `src/renderer/src/store/editor.js`

Ne pas modifier Muya pour une demande UI simple. Modifier Muya seulement si le parsing, le rendu Markdown ou les comportements d'edition internes sont en cause.

## Recherche

La recherche est exposee par `window.elephantnote.search.*`.

Le renderer garde les preferences de recherche dans `stores/searchStore.js`. L'index et les operations lourdes restent cote main process.

## Preview de site

La preview de site est exposee par `window.elephantnote.sitePreview.*`. Elle doit rester separee du store de vault pour ne pas melanger navigation de notes et processus de preview.


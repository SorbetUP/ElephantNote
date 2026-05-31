# Architecture ElephantNote

## Vue d'ensemble

ElephantNote est une app Electron/Vue construite sur un socle MarkText. Le projet garde le moteur Markdown existant, mais remplace l'experience produit par une interface de notes locale avec des fonctionnalites AI integrees.

Les responsabilites sont separees en trois couches:

- Main process Electron: acces disque, vaults, workspace local, recherche, preview, AI (agents, RAG, MCP, modeles), sync Git, plugins, programmes.
- Preload: contrat securise expose au renderer.
- Renderer Vue: UI, stores Pinia, interaction utilisateur, vues workspace (Dashboard, Chat, Wiki, Calendar, Graph, Canvas).

## Runtime

```txt
Electron main
  src/main/index.js
  src/main/app/*
  src/main/elephantnote/*
        ^
        | ipcRenderer.invoke / ipcMain.handle
        | elephantnote:api:call (API unifiee)
        v
Preload
  src/preload/index.js
        ^
        | window.elephantnote / window.elephantnote.api
        | window.fileUtils / window.path / window.commandExists
        | window.electron / window.rgPath / window.i18nUtils
        v
Renderer Vue
  src/renderer/src/pages/app.vue
  src/renderer/src/elephantnote/*
  src/renderer/src/elephantnote/services/elephantnoteClient.js
  src/renderer/src/components/editorWithTabs
  src/muya/lib/*
```

## API unifiee

ElephantNote expose desormais une API unifiee via `window.elephantnote.api.call(action, payload)`. Cette API:

- Utilise un registre d'actions dans `src/main/elephantnote/api.js`.
- Valide les payloads via `src/main/elephantnote/apiSchemas.js`.
- Retourne des enveloppes standardisees `{ ok, version, action, data, error }`.
- Version actuelle: `2026-05-24`.
- 60+ actions disponibles (vaults, notes, search, agents, rag, mcp, models, plugins, tasks, programs, sync, etc.).

Le client renderer (`elephantnoteClient.js`) utilise cette API en priorite, avec fallback vers les appels legacy.

## Principes de separation

- Le renderer ne lit pas directement le disque pour les operations de vault.
- Le preload ne contient pas de logique metier: il expose des fonctions et route vers IPC.
- Le main process valide les chemins et garde les operations dans le vault actif.
- Les stores Pinia gardent l'etat UI partage.
- Les composants Vue ne doivent pas connaitre les details IPC si un store peut les porter.
- Les helpers purs vont dans `utils/`.
- Les services renderer passent par `elephantnoteClient.js`.

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

## Agents AI

Systeme d'agents AI memoires en RAM cote main process (`src/main/elephantnote/agents.js`):

- Transport par defaut: `openai-compatible`.
- Configuration: `id`, `name`, `endpoint`, `model`, `apiKey`, `capabilities`.
- Normalisation des providers dans `src/common/elephantnote/aiProviders.js`.
- Les agents ne sont pas persistes (re-register au restart).

## RAG Chat

Chat avec reponses ancreees dans le vault actif via `window.elephantnote.rag.chat(message, limit)`. Utilise les notes locales comme source de citations.

## MCP (Model Context Protocol)

Integration MCP pour l'appel d'outils externes via `window.elephantnote.mcp.*`.

## Modeles locaux

Gestion des modeles Ollama via `src/main/elephantnote/modelRuntime.js`:

- `listLocalModels()`: liste les modeles Ollama installes.
- `downloadModel(id)`: telecharge un modele via Ollama.
- Selection de modele persistee dans le workspace.

## Plugins, Taches, Programmes

- **Plugins**: extensions configurables avec `list`, `set`, `run`.
- **Taches (tasks)**: operations planifiees avec `list`, `set`, `run`.
- **Programmes**: execution de commandes dans des environnements isoles via `src/main/elephantnote/programRuntime.js`. Support de prefixes de commande et variables d'environnement par environnement.

## Sync Git

Moteur de synchronisation Git via `src/main/elephantnote/sync/GitSyncEngine.js`:

- File d'operations (`queue`) avec statut (queued, running, done, error).
- Historique des operations.
- Operations: commit, push, pull, etc.

## Sources

Ingestion de contenu externe:

- `sources.ingestUrl`: capture d'une URL en note Markdown.
- `sources.importRss`: import d'un flux RSS avec limite d'articles.

## Wiki

Synthese locale de pages wiki a partir de notes:

- `wiki.propose`: genere des propositions de pages avec citations.
- `wiki.accept`: accepte une proposition (creer la page).
- `wiki.dismiss`: rejette une proposition.

## Calendar

Aggregation d'evenements:

- Evenements offline.
- Notes groupees par date de derniere edition.
- Import Google Calendar avec configuration OAuth.

## Atomic notes

Catalog de notes atomiques via `src/common/elephantnote/atomicWorkspace.js`.

## Feature flags et config AI

- `features.get/set`: activation/desactivation de fonctionnalites.
- `ai.config.get/set`: configuration AI globale.

## Modules partages (`src/common/elephantnote/`)

- `aiProviders.js`: normalisation des configs AI (OpenAI, Anthropic, Ollama, etc.).
- `atomicWorkspace.js`: gestion des atomic notes.
- `calendar.js`: helpers calendar.
- `featureFlags.js`: gestion des feature flags.
- `googleCalendar.js`: integration Google Calendar.
- `sources.js`: helpers sources.
- `wiki.js`: helpers wiki.

## Data Center

`src/main/dataCenter/`: module de gestion de donnees avec schema JSON (`schema.json`).


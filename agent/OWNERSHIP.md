# Ownership technique

## Zones a modifier en priorite

UI ElephantNote:

- `src/renderer/src/elephantnote/components`
- `src/renderer/src/elephantnote/styles`

Vues workspace:

- `src/renderer/src/elephantnote/components/{Dashboard,Chat,Wiki,Calendar,Graph,Canvas}View.vue`

Etat ElephantNote:

- `src/renderer/src/elephantnote/stores`

Logique locale:

- `src/main/elephantnote`

API unifiee:

- `src/main/elephantnote/api.js` (registre d'actions)
- `src/main/elephantnote/apiSchemas.js` (validation)

Contrat renderer/main:

- `src/preload/index.js`
- `src/renderer/src/elephantnote/services/elephantnoteClient.js`

AI (agents, RAG, MCP, modeles):

- `src/main/elephantnote/agents.js`
- `src/main/elephantnote/modelRuntime.js`
- `src/common/elephantnote/aiProviders.js`

Plugins/Taches/Programmes:

- `src/main/elephantnote/programRuntime.js`

Sync Git:

- `src/main/elephantnote/sync/GitSyncEngine.js`

Modules partages:

- `src/common/elephantnote/`

Markdown engine:

- `src/muya/lib`
- `src/renderer/src/components/editorWithTabs`

## Zones a eviter

- `node_modules/`
- `out/`
- `dist/`
- `build/`
- `legacy/`
- `blinko-offline/` sauf lecture ou doc de portage

## Quand toucher Blinko Offline

`blinko-offline/` est une reference. Modifier ce dossier seulement si la tache demande explicitement de maintenir cette reference.

Pour porter une feature, copier l'idee et reimplementer dans ElephantNote avec l'architecture locale.

## Quand toucher Muya

Toucher Muya seulement pour:

- parsing Markdown;
- export Markdown/HTML;
- comportement editeur bas niveau;
- syntax highlighting;
- selection/cursor interne.

Ne pas toucher Muya pour:

- ajouter un bouton toolbar;
- changer une carte;
- changer la sidebar;
- ajouter un panneau settings;
- ajouter une vue workspace.


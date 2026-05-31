# Playbook agent

## Avant de modifier

1. Lire `agent/README.md`.
2. Identifier la zone: renderer, main process, preload, Muya, API unifiee ou doc.
3. Verifier l'etat Git avec `rtk git status -sb`.
4. Ne pas toucher aux changements non lies deja presents dans le workspace.

## Decision rapide par symptome

Bug visuel dans l'app:

- Commencer dans `src/renderer/src/elephantnote/components`.
- Verifier `styles/app-shell.css` si le probleme est global.

Bug d'etat UI:

- Commencer dans `src/renderer/src/elephantnote/stores`.
- Verifier les appels au store dans les composants.

Bug fichier/vault/import:

- Commencer dans `src/main/elephantnote`.
- Verifier le contrat dans `src/preload/index.js` ou `src/main/elephantnote/api.js`.

Bug editeur Markdown:

- Verifier d'abord `NoteEditorHost.vue`.
- Ensuite seulement `src/renderer/src/components/editorWithTabs` ou `src/muya/lib`.

Bug recherche:

- Renderer: `src/renderer/src/elephantnote/search` et `stores/searchStore.js`.
- Main/API: chercher les handlers `en:search:*`.

Bug AI/agents/RAG/MCP:

- Agents: `src/main/elephantnote/agents.js` et `src/common/elephantnote/aiProviders.js`.
- RAG: chercher l'action `rag.chat` dans `src/main/elephantnote/api.js` et les handlers.
- MCP: chercher `mcp.tools.*` dans l'API.
- Modeles locaux: `src/main/elephantnote/modelRuntime.js`.

Bug workspace views (Dashboard, Chat, Wiki, Calendar, Graph, Canvas):

- Commencer dans `src/renderer/src/elephantnote/components/{view}View.vue`.
- Verifier `stores/vaultStore.js` pour l'etat partage.

Bug sync Git:

- `src/main/elephantnote/sync/GitSyncEngine.js`.

Bug plugins/taches/programmes:

- Programmes: `src/main/elephantnote/programRuntime.js`.
- Plugins/taches: chercher les actions `plugins.*`, `tasks.*`, `programs.*` dans `api.js`.

Bug sources/wiki/calendar:

- Modules partages: `src/common/elephantnote/{sources,wiki,calendar}.js`.
- Handlers API: actions `sources.*`, `wiki.*`, `calendar.*` dans `api.js`.

## Regles de composants

- Un composant doit avoir une responsabilite lisible depuis son nom.
- Si un composant depasse environ 300 lignes, chercher une extraction logique.
- Les composants "host" orchestrent, les composants "leaf" affichent et emettent.
- Les composants leaf ne doivent pas appeler IPC directement.
- Les stores peuvent appeler `window.elephantnote`.

## Regles de commit

- Stager explicitement les fichiers concernes.
- Ne jamais utiliser `rtk git add .` dans ce repo sale.
- Verifier le staged diff avec `rtk git diff --cached --stat`.
- Committer seulement quand lint/tests/build sont au vert ou quand l'echec est documente.

## Checklist finale

- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk pnpm build`
- Supprimer `out/` apres build si le dossier a ete regenere.
- Verifier qu'il n'y a qu'un `.git` a la racine.
- Pousser vers la branche demandee.


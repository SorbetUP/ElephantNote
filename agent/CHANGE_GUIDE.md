# Guide de modification

## Ajouter une feature UI

1. Trouver le composant dans `COMPONENTS.md`.
2. Ajouter l'etat local seulement si la feature est purement visuelle.
3. Si l'etat doit survivre ou etre partage, utiliser un store dans `src/renderer/src/elephantnote/stores`.
4. Si la feature touche le disque ou le systeme, ajouter une API dans `src/main/elephantnote/api.js` (ou utiliser l'API unifiee existante).
5. Ajouter ou ajuster un test si la logique peut regresser.

## Corriger un bug

1. Reproduire mentalement le flux: composant -> store -> elephantnoteClient -> API unifiee -> main process.
2. Chercher d'abord dans `src/renderer/src/elephantnote` pour les bugs UI.
3. Chercher dans `src/main/elephantnote` pour les bugs de fichiers, vaults, imports ou indexation.
4. Garder la correction proche du fichier responsable.
5. Lancer au minimum `rtk pnpm lint`; lancer `rtk pnpm test` si la correction touche de la logique.

## Ajouter une action sur les notes

1. UI: bouton ou menu dans `NoteCard.vue`, `FolderCard.vue`, `LibraryToolbar.vue` ou `NoteEditorToolbar.vue`.
2. Etat: action dans `stores/vaultStore.js`.
3. API renderer-main: utiliser l'API unifiee `window.elephantnote.api.call('notes.*', payload)` ou ajouter une action dans `src/main/elephantnote/api.js` + `apiSchemas.js`.
4. Main process: handler dans `src/main/elephantnote`.
5. Rafraichir `entries`, `workspace`, `openedNotes` ou `pinnedNotePaths` selon l'impact.

## Modifier l'editeur Markdown

1. Verifier si le changement concerne l'enveloppe ElephantNote ou le moteur MarkText.
2. Enveloppe: `src/renderer/src/elephantnote/components/NoteEditor*.vue`.
3. Moteur: `src/renderer/src/components/editorWithTabs` ou `src/renderer/src/muya`.
4. Ne pas changer Muya pour un simple bouton ou une mise en page.

## Ajouter une fonctionnalite AI (agent, RAG, MCP, modeles)

1. Verifier si l'action existe deja dans `src/main/elephantnote/api.js`.
2. Pour un nouvel agent: utiliser `agents.js` avec transport `openai-compatible`.
3. Pour RAG: utiliser l'action `rag.chat` avec citations de notes.
4. Pour MCP: utiliser `mcp.tools.list` et `mcp.tools.call`.
5. Pour les modeles locaux: utiliser `modelRuntime.js` (Ollama).
6. Config AI globale: `ai.config.get/set`.

## Ajouter une vue workspace

1. Creer le composant dans `src/renderer/src/elephantnote/components/{Name}View.vue`.
2. Ajouter l'etat dans `stores/vaultStore.js` si partage.
3. Utiliser `elephantnoteClient` pour les appels API.
4. Integrer dans `MainContent.vue` pour l'affichage.

## Porter une idee depuis Blinko

1. Lire `agent/blinko-portage/CHECKLIST_FONCTIONNALITES_BLINKO_A_PORTER.md`.
2. Identifier si c'est une feature UI, store, API locale ou backend.
3. Implementer dans ElephantNote avec les conventions de ce repo, pas en copiant l'architecture Blinko.
4. Documenter tout ecart important dans `agent/blinko-portage/README.md` ou un nouveau fichier de portage.

## Nettoyage repo

- Garder un seul `.git`: celui de la racine.
- Supprimer les artefacts locaux: `.DS_Store`, `out/`, `dist/`, `build/`.
- Ne pas supprimer `pnpm-lock.yaml`.
- Ne pas supprimer `blinko-offline/` sans demande explicite: c'est une reference de portage.


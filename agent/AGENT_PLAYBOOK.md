# Playbook agent

## Avant de modifier

1. Lire `agent/README.md`.
2. Identifier la zone: renderer, main process, preload, Muya ou doc.
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
- Verifier le contrat dans `src/preload/index.js`.

Bug editeur Markdown:

- Verifier d'abord `NoteEditorHost.vue`.
- Ensuite seulement `src/renderer/src/components/editorWithTabs` ou `src/muya/lib`.

Bug recherche:

- Renderer: `src/renderer/src/elephantnote/search` et `stores/searchStore.js`.
- Main/API: chercher les handlers `en:search:*`.

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


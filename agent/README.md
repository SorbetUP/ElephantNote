# Guide agent ElephantNote

Ce dossier sert de point d'entree pour modifier ElephantNote sans devoir relire tout le projet.

Objectif: un agent leger doit pouvoir trouver rapidement ou faire une modification, quelle commande lancer, et quels fichiers ne pas toucher sans raison.

## Lire dans cet ordre

1. `PROJECT_MAP.md`: structure du repo et responsabilites des dossiers.
2. `COMPONENTS.md`: composants ElephantNote et points d'extension UI.
3. `ARCHITECTURE.md`: architecture runtime, flux renderer/main et frontmatter.
4. `IPC_CONTRACTS.md`: contrats `window.elephantnote` et zones main process.
5. `CHANGE_GUIDE.md`: recettes pour ajout de feature, correction de bug, refactor et validation.
6. `TESTING.md`: commandes de verification et interpretation des warnings.
7. `AGENT_PLAYBOOK.md`: checklist d'intervention pour un agent.
8. `blinko-portage/README.md`: cahier de portage des idees venant de Blinko Offline.

## Regles locales

- Le repo principal est `/Users/sorbet/Desktop/Dev/c-editor`.
- Il ne doit y avoir qu'un seul depot Git: celui de la racine.
- `blinko-offline/` est une reference de portage, pas un repo separe.
- Les commandes shell doivent etre prefixees par `rtk`.
- Ne pas modifier `node_modules/`, `out/`, `dist/`, `build/` ou les fichiers generes.
- Pour l'UI ElephantNote, commencer par `src/renderer/src/elephantnote`.
- Pour les IPC/API exposees au renderer, verifier `src/preload/index.js` et `src/main/elephantnote`.

## Commandes utiles

```bash
rtk pnpm install
rtk pnpm lint
rtk pnpm test
rtk pnpm build
rtk pnpm dev
```

Pour une verification rapide apres une modification Vue:

```bash
rtk pnpm lint
rtk pnpm test
```

## Definition of done

- Le changement est localise dans le bon dossier.
- Les composants restent petits et nommes selon leur responsabilite.
- `rtk pnpm lint` passe.
- `rtk pnpm test` passe si la logique a change.
- `rtk pnpm build` passe avant un push vers `develop`.
- La doc agent est mise a jour si un nouveau flux, composant ou contrat est introduit.

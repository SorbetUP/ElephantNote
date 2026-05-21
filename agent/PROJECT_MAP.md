# Carte du projet

## Racine

- `package.json`: scripts Electron/Vite, dependances et cible Node/pnpm.
- `electron.vite.config.js`: configuration du build Electron.
- `src/`: application principale.
- `static/`: assets statiques empaquetes.
- `test/`: tests Vitest et Playwright.
- `agent/`: documentation de travail pour agents.
- `blinko-offline/`: reference de portage Blinko. Ne pas developper la cible finale ici.
- `legacy/`: ancien code garde comme reference. Ne pas reintroduire sans decision explicite.

## Process Electron

- `src/main/`: process principal Electron.
- `src/main/index.js`: entree main process.
- `src/main/app/`: cycle de vie app, fenetres, chemins.
- `src/main/windows/`: creation et gestion des fenetres.
- `src/main/elephantnote/`: logique locale ElephantNote cote main process.
- `src/preload/index.js`: API exposee au renderer via `window.elephantnote`, `window.electron`, `window.fileUtils`, `window.path`.

## Renderer

- `src/renderer/src/main.js`: bootstrap Vue.
- `src/renderer/src/pages/app.vue`: integration entre l'ancien socle MarkText et le shell ElephantNote.
- `src/renderer/src/elephantnote/`: nouvelle experience ElephantNote.
- `src/renderer/src/components/`: composants herites de MarkText.
- `src/renderer/src/store/`: stores Pinia historiques MarkText.
- `src/renderer/src/muya/`: moteur d'edition Markdown.

## ElephantNote

- `src/renderer/src/elephantnote/components/`: composants Vue de l'app de notes.
- `src/renderer/src/elephantnote/stores/`: etat applicatif ElephantNote.
- `src/renderer/src/elephantnote/search/`: recherche modale, resultats et reglages.
- `src/renderer/src/elephantnote/sitePreview/`: preview de dossier/site Markdown.
- `src/renderer/src/elephantnote/services/`: services renderer.
- `src/renderer/src/elephantnote/utils/`: helpers purs.
- `src/renderer/src/elephantnote/styles/app-shell.css`: styles globaux du shell.

## Flux de donnees

1. Le renderer appelle `window.elephantnote.*`.
2. `src/preload/index.js` transmet via `ipcRenderer.invoke`.
3. Le main process traite dans `src/main/elephantnote/*`.
4. Les stores Pinia mettent a jour l'UI.
5. L'editeur Markdown reste pilote par les stores MarkText existants.


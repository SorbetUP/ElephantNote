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
- `src/main/app/`: cycle de vie app, fenetres, chemins, metadata, icone, nativeTheme, windowManager.
- `src/main/windows/`: creation et gestion des fenetres (editor, setting, base, url, utils).
- `src/main/elephantnote/`: logique locale ElephantNote cote main process.
- `src/preload/index.js`: API exposee au renderer via `window.elephantnote`, `window.elephantnote.api`, `window.electron`, `window.fileUtils`, `window.path`, `window.commandExists`, `window.rgPath`, `window.i18nUtils`.

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
- `src/renderer/src/elephantnote/services/`: services renderer (elephantnoteClient, excalidraw, markdownMetaService).
- `src/renderer/src/elephantnote/utils/`: helpers purs (markdownTags, noteDocument, noteCardView, dom, categoryActions).
- `src/renderer/src/elephantnote/styles/app-shell.css`: styles globaux du shell.

## Main process ElephantNote

- `src/main/elephantnote/core.js`: core vault/frontmatter.
- `src/main/elephantnote/api.js`: API unifiee avec registre d'actions (60+).
- `src/main/elephantnote/apiSchemas.js`: validation des payloads API.
- `src/main/elephantnote/agents.js`: gestion des agents AI (memoire RAM).
- `src/main/elephantnote/modelRuntime.js`: runtime Ollama (liste/telechargement modeles).
- `src/main/elephantnote/programRuntime.js`: execution de programmes dans des environnements.
- `src/main/elephantnote/markdown.js`: helpers Markdown.
- `src/main/elephantnote/vaults.js`: gestion des vaults.
- `src/main/elephantnote/workspaceMigrations.js`: migrations workspace.
- `src/main/elephantnote/googleKeepImport.js`: import Google Keep.
- `src/main/elephantnote/search/`: service de recherche (ElephantSearchService, localMeaningSearch, VectraIndexManager, VaultSearchWatcher, searchIpc, searchTypes, pathSafety, markdownToSearchText).
- `src/main/elephantnote/sitePreview/`: preview de site (ElephantSiteManager, SitePreviewService, StaticSiteServer, sitePreviewIpc, siteTypes, pathSafety).
- `src/main/elephantnote/sync/GitSyncEngine.js`: moteur de sync Git avec file d'operations.

## Modules partages

- `src/common/elephantnote/`: modules partages main/renderer.
  - `aiProviders.js`: normalisation configs AI.
  - `atomicWorkspace.js`: atomic notes.
  - `calendar.js`: helpers calendar.
  - `featureFlags.js`: feature flags.
  - `googleCalendar.js`: Google Calendar.
  - `sources.js`: helpers sources.
  - `wiki.js`: helpers wiki.
- `src/common/filesystem/`: helpers filesystem (paths, index).
- `src/common/envPaths.js`: chemins environnement.
- `src/common/encoding.js`: encodage.
- `src/common/theme.js`: theme.
- `src/common/i18n.js`: internationalisation.
- `src/common/commands/constants.js`: constantes commandes.

## Data Center

- `src/main/dataCenter/`: gestion de donnees avec schema JSON.

## Flux de donnees

1. Le renderer appelle `window.elephantnote.api.call(action, payload)` (ou legacy `window.elephantnote.*`).
2. `src/preload/index.js` transmet via `ipcRenderer.invoke`.
3. Le main process traite dans `src/main/elephantnote/*` via le registre API.
4. Les stores Pinia mettent a jour l'UI.
5. L'editeur Markdown reste pilote par les stores MarkText existants.


# Checklist des fonctionnalites ajoutees - Blinko Offline

Source: inspection du code, de l'historique Git, des documents `agent/` et des conversations Codex locales. Pour la synchronisation, seule l'implementation la plus recente est retenue: runtime local Rust/Tauri + SQLite + outbox/oplog + endpoints `/changes` et `/sync/*`. Les anciennes pistes Dexie/IndexedDB ne sont pas considerees comme l'etat final.

## Architecture locale/offline

- [x] Mode local-first embarque
  - Description: transformation de Blinko en application utilisable sans serveur externe. L'application Tauri demarre un backend local Axum sur `127.0.0.1` avec port ephemere, expose la base URL au frontend et fait fonctionner les flux principaux contre ce backend local.
  - Details: l'UI continue a consommer une API HTTP proche du serveur web, ce qui limite les bifurcations frontend. En cas d'indisponibilite HTTP locale, certains appels ont des fallbacks Tauri.
  - Fichiers: `app/src-tauri/src/lib.rs`, `app/src-tauri/src/local_api/`, `app/src/lib/blinkoEndpoint.ts`, `app/src/lib/trpc.ts`.

- [x] Base locale SQLite
  - Description: ajout d'un stockage local persistant pour notes, settings, pieces jointes, outbox, etat de sync et conflits.
  - Details: la DB locale devient la source de verite en mode local/sync; les donnees sont stockees dans l'app data Tauri, avec surcharge possible via `BLINKO_APP_DATA_DIR`.
  - Fichiers: `app/src-tauri/src/local_db/`, `app/src-tauri/migrations/`, `app/src-tauri/src/local_runtime/paths.rs`.

- [x] Configuration locale persistante
  - Description: ajout de `local_config.json` pour gerer `device_id`, API locale, endpoints distants, token local, auto-sync et intervalle.
  - Details: le mode `remote` historique est traite comme un cas legacy; l'etat final distingue surtout local sans endpoint et sync avec endpoints.
  - Fichiers: `app/src-tauri/src/local_runtime/config.rs`.

- [x] API locale Axum compatible web/tRPC
  - Description: endpoints locaux pour health, auth, notes, settings, fichiers, sync, conflits, partage et tRPC de compatibilite.
  - Details: l'objectif est de couvrir les workflows Blinko usuels sans serveur Node/Postgres, tout en gardant une surface proche du backend web.
  - Fichiers: `app/src-tauri/src/local_api/router.rs`, `app/src-tauri/src/local_api/handlers_trpc.rs`, `app/src-tauri/src/local_api/handlers_notes.rs`, `app/src-tauri/src/local_api/handlers_files.rs`.

## Authentification et demarrage

- [x] Auth locale et utilisateur local
  - Description: ajout d'un utilisateur local gere en SQLite/settings, avec login, profile, logout, inscription initiale et verification `canRegister`.
  - Details: correction des erreurs 401 en mode local, generation/storing de credentials locaux et middleware adapte au contexte Tauri.
  - Fichiers: `app/src-tauri/src/local_api/local_user.rs`, `app/src-tauri/src/local_api/handlers_auth.rs`, `app/src-tauri/src/local_api/middleware.rs`, `app/src-tauri/src/local_db/settings.rs`.

- [x] Resolution fiable de l'endpoint local/web
  - Description: correction des cas ou un endpoint `127.0.0.1:<port>` stocke en `localStorage` etait reutilise dans le navigateur web, cassant les requetes par CORS.
  - Details: en web, l'application revient sur `window.location.origin`; en Tauri, elle recupere l'API locale exposee par Rust.
  - Fichiers: `app/src/lib/blinkoEndpoint.ts`, `app/src/lib/trpc.ts`.

- [x] Build desktop stabilise
  - Description: corrections permettant a `bun run build:bundle` de produire une app macOS qui se lance.
  - Details: corrections autour du backend local, des assets, du port local, de l'auth locale et du demarrage Tauri.
  - Sorties observees: `app/src-tauri/target/release/bundle/macos/Blinko.app`, `app/src-tauri/target/release/bundle/dmg/Blinko_1.8.4_aarch64.dmg`.

## Notes, recherche et ressources

- [x] CRUD notes local
  - Description: creation, lecture, modification, suppression, archivage, trash/restore et pin/top note en mode local.
  - Details: l'API locale expose les operations necessaires aux vues Blinko, Notes, Todos et detail note, avec compatibilite tRPC.
  - Fichiers: `app/src-tauri/src/local_db/notes.rs`, `app/src-tauri/src/local_api/handlers_notes.rs`, `app/src-tauri/src/local_api/handlers_trpc.rs`.

- [x] Filtrage par type de note
  - Description: correction du cas ou une note creee dans Blinko apparaissait dans les autres onglets.
  - Details: `notes.list` respecte le type demande (`blinko`, `note`, `todo`) et `type=-1` sert de vue globale.
  - Fichier: `app/src-tauri/src/local_api/handlers_trpc.rs`.

- [x] Recherche globale corrigee
  - Description: correction de la recherche qui ne renvoyait pas les notes, affichait toutes les ressources ou gardait des resultats settings incoherents.
  - Details: normalisation de la requete, gestion explicite des prefixes `@` et `#`, mode AI uniquement avec `@`, recherche notes/ressources/settings et tests unitaires.
  - Fichiers: `app/src/components/Layout/GlobalSearch.tsx`, `app/src/lib/searchUtils.ts`, `app/src/lib/__tests__/searchUtils.test.ts`.

- [x] Recherche locale notes + pieces jointes
  - Description: la recherche locale couvre titre, contenu, noms/chemins de pieces jointes et fusionne les notes trouvees via documents attaches.
  - Details: pagination et filtrage des attachments dans `attachments.list`; exclusion des placeholders `.folder` dans les ressources.
  - Fichiers: `app/src-tauri/src/local_api/handlers_trpc.rs`, `app/src-tauri/src/local_db/attachments.rs`, `app/src/pages/resources.tsx`.

- [x] Gestion locale des pieces jointes
  - Description: upload, download, overwrite, delete, linkage avec notes, metadata et stockage fichier dans `attachments/`.
  - Details: les fichiers locaux sont exposes par l'API locale et synchronisables par hash/sync_id.
  - Fichiers: `app/src-tauri/src/local_api/handlers_files.rs`, `app/src-tauri/src/local_db/attachments.rs`.

- [x] Page Resources amelioree
  - Description: recherche et actions de ressources renforcees, meilleure integration avec les pieces jointes locales et sync.
  - Details: support de l'ouverture, du telechargement, du filtrage et de l'exclusion de placeholders de dossiers.
  - Fichier: `app/src/pages/resources.tsx`.

## Synchronisation finale retenue

- [x] Moteur de sync local Rust/Tauri
  - Description: synchronisation incremental entre la DB locale et un serveur distant via outbox/oplog, pull/push et cursors.
  - Details: le scheduler lit les changements locaux, tire les operations distantes via `/changes`, applique les operations, pousse l'outbox locale et met a jour l'etat par endpoint.
  - Fichiers: `app/src-tauri/src/sync/scheduler.rs`, `app/src-tauri/src/sync/mod.rs`, `app/src-tauri/src/sync/remote_client.rs`, `app/src-tauri/src/local_db/outbox.rs`, `app/src-tauri/src/local_db/oplog.rs`, `app/src-tauri/src/local_db/sync_state.rs`.

- [x] Sync multi-endpoints configuree par settings
  - Description: configuration d'un ou plusieurs serveurs distants avec URL/token, activation de `sync_auto`, intervalle et sync manuelle.
  - Details: l'interface de settings distingue la sync appareil, la replication serveur et la sauvegarde locale; sur mobile elle utilise des onglets.
  - Fichiers: `app/src/components/BlinkoSettings/UnifiedSyncSetting.tsx`, `app/src/components/BlinkoSettings/SyncSetting.tsx`, `app/src/components/BlinkoSettings/ServerSyncSetting.tsx`.

- [x] Sync des attachments
  - Description: les pieces jointes sont synchronisees en deux temps: metadata puis binaire.
  - Details: les erreurs d'upload binaire ne bloquent pas toute la sync; les fichiers restent reessayables. Les endpoints par `sync_id` permettent de retrouver les fichiers cote serveur.
  - Fichiers: `app/src-tauri/src/sync/scheduler.rs`, `server/routerExpress/file/`, `server/lib/sync_notes.ts`.

- [x] Gestion des conflits
  - Description: strategie last-write-wins basee sur `updated_at`, avec journalisation des conflits et payloads local/remote.
  - Details: les conflits sont stockes pour inspection; un tie-breaker par `device_id` est prevu pour timestamps egaux.
  - Fichiers: `app/src-tauri/src/local_db/conflicts.rs`, `app/src-tauri/src/local_api/handlers_conflicts.rs`, `docs/sync_protocol.md`.

- [x] Reprise apres remote reset / DB vide
  - Description: le scheduler detecte certains cas de reset ou de base locale vide et force un pull complet ou une re-exportation locale.
  - Details: utile pour remettre en coherence le serveur apres reset des tables distantes ou divergence de cursor.
  - Fichiers: `app/src-tauri/src/sync/scheduler.rs`, `app/src-tauri/src/sync/migration.rs`.

- [x] Sync tags/ressources nettoyee
  - Description: correction d'un probleme de pollution de tags en mode sync et de ressources invisibles apres sync.
  - Details: extraction locale des tags, materialisation serveur plus propre et re-upload des attachments lors d'un reset remote.
  - Fichiers: `app/src-tauri/src/local_db/tags.rs`, `server/routerTrpc/note.ts`, `server/lib/sync_notes.ts`, `agent/feature-incoming/sync-tags-resources/BUG.md`.

## Import/export, sauvegarde et migration

- [x] Sauvegarde locale `.bko`
  - Description: export ZIP de la base locale, de `local_config.json` et du dossier `attachments` dans un fichier `blinko-backup-<timestamp>.bko`.
  - Details: checkpoint WAL best-effort avant export; partage natif du fichier via Tauri/mobile; extension `.bko` acceptee comme archive ZIP.
  - Fichiers: `app/src-tauri/src/backup_commands.rs`, `app/src/components/BlinkoSettings/BackupSetting.tsx`.

- [x] Restauration locale `.bko`
  - Description: selection d'un backup, creation d'une sauvegarde de securite `before-restore`, fermeture du pool SQLite, extraction DB/config/attachments puis redemarrage de l'app.
  - Details: nettoyage best-effort des anciens fichiers pour eviter les reliquats apres restore; protection contre path traversal via `enclosed_name`.
  - Fichiers: `app/src-tauri/src/backup_commands.rs`, `app/src/components/BlinkoSettings/BackupSetting.tsx`.

- [x] Import Google Keep et auto-tags experimentaux
  - Description: scripts d'analyse et de comparaison pour importer/exporter des donnees Google Keep et experimenter l'auto-tagging par similarite/TF-IDF/vectorisation.
  - Details: plusieurs variantes testent hierarchy, paraphrases, clusters et rapports de qualite.
  - Fichiers: `agent/keep_autotag_*.ts`, `agent/experiments/keep-autotag/`, `app/src-tauri/src/local_api/google_keep.rs`.

## UI/UX desktop et mobile

- [x] Parite mobile Android
  - Description: adaptation des composants Blinko pour une experience mobile: bottom nav, sidebar mobile, cards en une colonne, settings en tabs, actions visibles sans hover, safe areas et status bar.
  - Details: tests dedies sur navigation mobile, settings, AI actions, analytics mobile et gestures.
  - Fichiers: `agent/MOBILE_PARITY_MATRIX.md`, `app/src/components/Layout/`, `app/src/pages/*.mobile.test.tsx`, `app/src/lib/__tests__/useAndroidShortcuts.test.tsx`.

- [x] Shortcuts et intents Android
  - Description: prise en charge des raccourcis Android, quick note, voice recording et ingestion de donnees partagees vers l'app.
  - Details: plugin Android et hooks frontend pour lire/traiter les donnees de share intent.
  - Fichiers: `app/tauri-plugin-blinko/android/src/main/java/Blinko.kt`, `app/tauri-plugin-blinko/android/src/main/java/BlinkoPlugin.kt`, `app/src/lib/__tests__/useAndroidShortcuts.test.tsx`.

- [x] Ouverture de fichiers Android corrigee
  - Description: ajout du chemin de fichiers externe dans `file_paths.xml` et ajustements du plugin Android pour les fichiers locaux/partages.
  - Details: utile pour image viewer, downloads, backups et share sheet.
  - Fichiers: `app/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`, `app/tauri-plugin-blinko/android/src/main/java/Blinko.kt`.

- [x] Viewer image enrichi
  - Description: toolbar image avec rotation gauche/droite, zoom, reset, download, fermeture et edition Excalidraw quand disponible.
  - Details: taille d'icones adaptee Android/Tauri et tests de toolbar.
  - Fichiers: `app/src/components/Common/ImageViewer/PhotoViewToolbar.tsx`, `app/src/components/Common/ImageViewer/PhotoViewToolbar.test.tsx`, `app/src/components/Common/ImagePreviewDialog/index.tsx`, `app/src/components/Common/AttachmentRender/imageRender.tsx`.

- [x] Edition Excalidraw depuis images
  - Description: integration plus robuste entre preview image et edition Excalidraw, avec fallback scene vide quand les donnees ne sont pas disponibles.
  - Details: evite les crashes/etats bloquants lors de l'ouverture d'anciens dessins ou d'images sans scene valide.
  - Fichiers: `app/src/components/Common/Excalidraw/ExcalidrawEditorDialog.tsx`, `app/src/components/Common/Excalidraw/ExcalidrawEditorDialog.emptySceneFallback.test.tsx`.

- [x] Panneau tags mobile extensible
  - Description: amelioration du `TagListPanel` pour les petits ecrans, avec expansion mobile et tests.
  - Details: facilite l'acces aux tags sans casser le layout desktop.
  - Fichiers: `app/src/components/Common/TagListPanel.tsx`, `app/src/components/Common/TagListPanel.mobileExpand.test.tsx`.

- [x] Dossiers de tags par parent
  - Description: support du regroupement/filtrage de tags par parent dans une branche separee, avec correction du bug de clic tag qui affichait toutes les notes.
  - Details: le handler local tRPC filtre correctement par `tagId`.
  - Fichiers: branche `nsb/tag-folders-parent`, `agent/feature-incoming/tag-click-shows-all-notes/BUG.md`.

## Editeur, rendu Markdown et assets

- [x] Assets Vditor embarques et servis localement
  - Description: ajout et service d'assets Vditor/Markdown pour eviter les erreurs MIME, CSP, 401 ou fichiers manquants en local/desktop.
  - Details: les assets couvrent highlight.js, KaTeX, Mermaid, Markmap, Graphviz, Flowchart, PlantUML, abcjs, smiles-drawer, icones et CSS.
  - Fichiers: `server/vditor/`, `server/index.ts`, `app/src-tauri/src/local_api/router.rs`.

- [x] Edition single-click et fermeture/sauvegarde
  - Description: amelioration de l'edition des notes avec click outside, fermeture par X et mise a jour de la carte/liste/search apres sauvegarde.
  - Details: evite les pertes de contenu et garde les previews synchronisees apres edition.
  - Fichiers: `app/src/components/BlinkoCard/FullscreenEditor.tsx`, `app/src/components/BlinkoEditor/`, `app/src/store/blinkoStore.tsx`.

- [x] Correction de perte de contenu lors de conversion note
  - Description: correction d'un cas ou du contenu pouvait etre perdu pendant la conversion ou l'edition d'une note.
  - Details: commit dedie `a600c63d Fix note conversion content loss`.
  - Fichiers: voir historique Git autour de `a600c63d`.

## IA et configuration serveur

- [x] Onglet IA ameliore
  - Description: nettoyage de l'UX providers/models, meilleure detection des CLI IA et experience Ollama/CLI plus lisible.
  - Details: detection CLI durcie, quick actions settings, deplacement du serveur local Ollama et endpoint hardening.
  - Fichiers: `app/src/components/BlinkoSettings/AiSetting/`, `app/src-tauri/src/desktop/cli_detect.rs`, `app/src-tauri/src/desktop/ollama.rs`.

- [x] Serveur Ollama gere localement
  - Description: integration d'un serveur Ollama manage cote desktop avec controle de l'endpoint et durcissement des cas d'erreur.
  - Details: fonctionnalite desktop, explicitement hors scope mobile dans la matrice mobile.
  - Fichiers: `app/src-tauri/src/desktop/ollama.rs`, commits `5e8cb6db`, `09243212`.

- [x] Onglet corbeille et quick actions settings
  - Description: ajout/amelioration de sections settings utiles pour gerer la corbeille et des actions rapides.
  - Details: lie aux commits `87234dd7` et `8734081e`.
  - Fichiers: `app/src/components/BlinkoSettings/`.

## Serveur web et securite heritee upstream

- [x] Routes serveur pour sync web
  - Description: routes `/changes` et support de materialisation cote serveur pour recevoir/envoyer les changements venant des clients locaux.
  - Details: utilisees par le moteur local final; les details exacts du contrat sont documentes dans `docs/sync_protocol.md`.
  - Fichiers: `server/index.ts`, `server/lib/sync_notes.ts`, `server/routerExpress/file/`.

- [x] Durcissements securite upstream integres
  - Description: integration de correctifs upstream contre IDOR, path traversal, ecriture arbitraire, escalation privilege, command injection et fuites d'infos utilisateur.
  - Details: ces commits viennent de l'historique upstream mais font partie de l'etat actuel du projet local.
  - Fichiers: `server/routerTrpc/*`, `server/routerExpress/file/*`, `server/lib/files.ts`.

## Tests et documentation

- [x] Matrice de fonctionnalites globale/web/PC/mobile
  - Description: inventaire des fonctionnalites par plateforme et matrice de couverture de tests.
  - Details: les fichiers listent plus de 200 capacites globales et les differences web/desktop/mobile.
  - Fichiers: `agent/features-global.md`, `agent/features-web.md`, `agent/features-pc.md`, `agent/features-mobile.md`, `agent/TODO_TEST_COVERAGE_MATRIX.md`.

- [x] Tests API locale
  - Description: tests Rust sur auth, CRUD notes, tRPC local, attachments, share, tags, resources, token auth et endpoints locaux.
  - Details: ils valident les workflows essentiels du mode offline.
  - Fichiers: `app/src-tauri/src/local_api/tests.rs`.

- [x] Tests frontend UI/mobile/settings/search
  - Description: tests unitaires et composants pour recherche, settings, mobile nav, sidebars, AI cards, analytics, Excalidraw, ImageViewer et backup.
  - Details: ajout progressif apres corrections fonctionnelles pour verrouiller les regressions.
  - Fichiers: `app/src/**/*.test.tsx`, `app/src/**/*.test.ts`, `app/src/components/BlinkoSettings/BackupSetting.test.tsx`, `app/src/components/BlinkoSettings/UnifiedSyncSetting.test.tsx`.

- [x] Documentation architecture offline
  - Description: documentation de l'architecture locale, decisions de sync, stockage et contraintes mobile.
  - Details: utile pour reprendre le projet sans relire tout le code.
  - Fichiers: `ARCHITECTURE_LOCAL_MODE.md`, `docs/sync_protocol.md`, `docs/phase1_*`, `agent/REPO_DOSSIER.md`, `agent/WORKLOG.md`.

## Points restants / verification conseillee

- [ ] Tester un cycle complet Android reel: mode local, creation note, attachment, backup, restore, sync now, share intent.
- [ ] Ajouter un test d'integration automatique complet pour sync attachment web -> local et local -> web.
- [ ] Verifier le comportement iOS si le portage mobile est poursuivi.
- [ ] Nettoyer les documents historiques qui decrivent d'anciennes pistes de sync afin d'eviter la confusion avec l'implementation finale.

# Plan — Etapes suivantes (sync remote + contrat /changes + pieces jointes + tags)

## Objectif
Stabiliser le MVP local-first en verrouillant le **contrat serveur remote** pour la sync (`/changes` + fichiers), et combler les gaps fonctionnels identifiés (IDs d’attachments, tags/metadata, migrations config), avec des tests reproductibles en CLI.

## Contexte repo (etat actuel)
- Local API embarquee (Rust/Axum) + endpoints REST + compat tRPC via `/api/trpc`. `app/src-tauri/src/local_api/router.rs:28-71`
- Sync scheduler: push/pull `/changes`, outbox, LWW + tie-break `device_id`, upload/download fichiers. `app/src-tauri/src/sync/scheduler.rs:12-106`, `app/src-tauri/src/sync/mod.rs:54-118`, `app/src-tauri/src/sync/remote_client.rs:32-113`
- Attachments local: DB `attachments` (id local + sync_id) et fichiers sous app data. `app/src-tauri/migrations/0001_init.sql:42-55`, `app/src-tauri/src/local_runtime/paths.rs:18-45`
- Tags/metadata: stub dans reponses tRPC local (tags = [], metadata = {}). `app/src-tauri/src/local_api/handlers_trpc.rs:418-423`, `app/src-tauri/src/local_api/handlers_trpc.rs:556-575`

## Contraintes
- Ne pas lancer de build Tauri/DMG.
- Validation via commandes CLI (cargo/bun) et lecture code.

## Etat des tests (aujourd’hui)
- OK: `bun run test:api-local` (Rust: local_runtime/local_db/local_api + fixtures). 
- OK: `bun run test:unit` (pipeline frontend, inclut un `vite build` dans turbo).

## Hypotheses
- Le serveur distant qui doit recevoir la sync est le dossier `server/` de ce repo.
- L’API remote accepte l’auth via Bearer token (a confirmer pour `/changes`).

## Scope
### In-scope
- Definir et implementer (cote `server/`) le contrat `/changes` compatible avec `RemoteClient`.
- Clarifier/standardiser l’identifiant d’attachment sur le remote (sync_id vs id numerique) et ajouter une API remote compatible.
- Etendre le stockage local pour tags (deja tables SQLite) et alimenter les reponses tRPC local.
- Rendre la config `local_config.json` migrable (schema_version).

### Out-of-scope
- UI lourde (refactor visuel).
- Packaging/bundles (DMG, APK release, etc).

## Plan technique
### 1) Verrouiller le protocole `/changes` cote remote
- [ ] Ajouter au serveur `server/` des endpoints HTTP:
  - [ ] `GET /changes?since=<cursor>` -> `{ cursor, ops: SyncOp[] }`
  - [ ] `POST /changes` -> accepte `{ ops: SyncOp[] }`
- [ ] Choisir le format du cursor (ex: autoincrement id de table d’oplog remote, ou timestamp ISO).
- [ ] Ajouter auth (Bearer) coherente avec le reste du server.
- [ ] Documenter l’ABI dans `docs/sync_protocol.md`.

Evidence: le client local appelle `{base}/changes` et optionnellement `since`. `app/src-tauri/src/sync/remote_client.rs:32-51`

### 2) Corriger le contrat fichiers remote pour la sync d’attachments
- [ ] Decider l’ID utilise pour download:
  - Option A: remote expose `GET /api/file/by-sync-id/:sync_id`.
  - Option B: remote accepte `GET /api/file/:id` ou `GET /api/file/:sync_id` (mais alors ambiguite type).
- [ ] S’assurer que la reponse de `/changes` pour `entity_type=attachment` contient assez de metadata (`sync_id`, `sha256`, `path` ou nom de fichier) pour resoudre le download.
- [ ] Ajuster `RemoteClient::download_attachment()` si necessaire.

Evidence: download utilise `sync_id` comme segment de path. `app/src-tauri/src/sync/remote_client.rs:96-113`

### 3) Tags / note_tags en local (remplacer les stubs)
- [ ] Implementer `TagRepository` + `NoteTagRepository` (ou etendre repos existants) et brancher dans:
  - [ ] `local_api/handlers_trpc.rs` pour `tags.list` et `tags.fullTagNameById`.
  - [ ] `note_to_value()` pour remplir `tags`.
- [ ] Mettre a jour l’outbox/oplog pour operations tag si necessaire (sinon rester out-of-scope).

Evidence: `handle_tags` renvoie vide, `note_to_value` force `tags: []`. `app/src-tauri/src/local_api/handlers_trpc.rs:418-423`, `app/src-tauri/src/local_api/handlers_trpc.rs:556-575`

### 4) Migrations de config locale
- [ ] Definir une strategie de migration pour `local_config.json`:
  - [ ] schema_version incrementale
  - [ ] migrations deterministes (ex: 1->2)
- [ ] Ajouter tests sur un fichier de config "ancien".

Evidence: `migrate_config` est un placeholder. `app/src-tauri/src/local_runtime/config.rs:76-83`

### 5) Conflits: formaliser le tie-breaker
- [ ] Confirmer si tie-break lexicographique sur `device_id` est acceptable.
- [ ] Sinon, introduire un champ explicite (ex: `device_rank` ou `op_id`) pour determinisme.
- [ ] Ajouter tests de conflits (2 ops meme updated_at).

Evidence: tie-break `incoming_device > local_device`. `app/src-tauri/src/sync/mod.rs:54-61`

## Checklist execution (commandes)
- [ ] Rust: `bun run test:api-local`
- [ ] Frontend: `bun run test:unit`
- [ ] (Optionnel) Lint rust: `bun run lint:rust`

## Risques
- Incompatibilite serveur remote: le dossier `server/` n’a pas (encore) `/changes`, donc la sync ne peut pas fonctionner contre ce server sans ajout.
- Ambiguite ID fichiers: confusion entre `attachments.id` (local int) et `attachments.sync_id` (uuid) peut casser download.
- Tags: les composants UI s’attendent probablement a une liste non vide/forme specifique.

## Rollout
- Etape 1: ajouter `/changes` en feature-flag cote server (ou route non exposee publiquement par defaut).
- Etape 2: activer sync sur un remote de test, valider push/pull notes.
- Etape 3: activer attachments (upload/download) avec verification sha256.

## Estimation (ordre de grandeur)
- `/changes` server + tests: 0.5-1.5j
- Contrat attachments remote: 0.5-1j
- Tags local: 0.5-1.5j
- Migrations config + tests: 0.25-0.75j
- Conflits tests + tie-break: 0.25-0.75j

## Questions ouvertes (a trancher)
- Quel est le remote de reference pour la sync (ce repo `server/` ou un autre) ?
- Quel est l’identifiant canonique pour attachments en transit (sync_id uniquement ?) ?
- Tags: doit-on synchroniser tags vers remote ou les garder local-only pour le MVP ?

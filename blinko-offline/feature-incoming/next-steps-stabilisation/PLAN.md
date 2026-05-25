# Plan — Etapes suivantes (stabilisation sync + tags + migrations + tests)

## Objectif
Stabiliser le mode local-first et la sync v1 apres les ajouts recents (remote `/changes`, attachments par `sync_id`, tags en lecture) afin d'assurer une compatibilite remote fiable, des migrations locales robustes et une couverture de tests reproductible.

## Contexte repo (etat actuel)
- Local API embarquee (Rust/Axum) expose les endpoints REST + compat tRPC. `app/src-tauri/src/local_api/router.rs`
- Sync scheduler: push/pull `/changes`, outbox, LWW avec tie-break `device_id`. `app/src-tauri/src/sync/scheduler.rs`, `app/src-tauri/src/sync/mod.rs`, `app/src-tauri/src/sync/remote_client.rs`
- Remote serveur (Express) inclut `/changes`, et fichiers avec `sync_id` upload/download. `server/routerExpress/changes.ts`, `server/routerExpress/file/upload.ts`, `server/routerExpress/file/file.ts`
- Tags locaux en lecture via repository, mais pas d'ecriture explicite lors des mutations. `app/src-tauri/src/local_db/tags.rs`, `app/src-tauri/src/local_api/handlers_trpc.rs`

## Contraintes
- Pas de build Tauri/DMG.
- Validation via CLI (cargo/bun) et lecture de code.

## Hypotheses
- Le serveur remote de reference est le dossier `server/` de ce repo.
- Le protocole sync v1 reste base sur `sync_id` (uuid) pour les attachments.

## Scope
### In-scope
- Valider le schema/migration remote (`sync_changes`, `attachments.sync_id`) et l'appliquer en dev/staging.
- Ajouter des tests serveur pour `/changes` et `/api/file/by-sync-id/:sync_id`.
- Completer l'ecriture des tags en local (creation + note_tags) ou expliciter le mode "read-only" si decision MVP.
- Formaliser la politique de conflits (tie-break) et documenter la decision.
- Ajouter tests d'integration sync (pull/push + attachments hash).
- Mettre a jour la doc de protocole et les notes d'implementation.

### Out-of-scope
- Refactor UI visuel.
- Packaging/bundles (DMG/APK release).
- Migration des donnees historiques cote remote au-dela du schema Prisma.

## Plan technique
### 1) Remote schema + migrations
- [ ] Verifier la presence des migrations Prisma pour `sync_changes` et `attachments.sync_id` cote `prisma/`.
- [ ] Appliquer la migration en dev/staging (ex: `bun run prisma:migrate:dev` ou `bun run prisma:migrate:deploy`).
- [ ] Regenerer le client Prisma si necessaire.

### 2) Tests serveur `/changes` + fichiers
- [ ] Ajouter des tests d'integration Express (supertest ou equivalent) pour:
  - [ ] `GET /changes?since=` retourne `cursor` + `ops`.
  - [ ] `POST /changes` insere des ops et renvoie un statut ok.
  - [ ] `GET /api/file/by-sync-id/:sync_id` stream un fichier.
- [ ] Ajouter un scenario "auth required" (token absent ou invalide).

### 3) Tags en ecriture (local)
- [ ] Definir la source de verite pour tags (local-only vs sync vers remote).
- [ ] Implementer upsert `tags` + `note_tags` lors de `note_create` / `note_update`.
- [ ] Ajouter des tests DB pour tags + relations.

### 4) Migrations `local_config.json`
- [ ] Ajouter un test de migration pour un `schema_version` ancien.
- [ ] Definir une convention de bump (ex: 1->2) et migration deterministe.

### 5) Politique de conflits
- [ ] Confirmer si tie-break lexicographique sur `device_id` est accepte.
- [ ] Sinon, introduire un champ deterministe (ex: `op_id` ou `device_rank`) et mettre a jour `should_apply_lww`.
- [ ] Ajouter tests de regression.

### 6) Tests d'integration sync
- [ ] Script CLI pour simuler: push -> pull -> resolution conflits.
- [ ] Scenario attachments: upload, download, verif sha256.

### 7) Documentation
- [ ] Mettre a jour `docs/sync_protocol.md` (schema `/changes`, fichiers).
- [ ] Mettre a jour `docs/phase0_api_map.md` et `docs/phase0_storage_map.md` si necessaire.

## Checklist execution (commandes)
- [ ] `bun run test:api-local`
- [ ] `bun run test:unit`
- [ ] `bun run test:integration` (necessite `LOCAL_API_URL` et serveur local lance)
- [ ] (Optionnel) `bun run lint:rust`

## Tests / Validation
- Valider que `/changes` fonctionne avec un token valide et refuse l'acces sinon.
- Verifier le download d'attachment via `sync_id` et hash OK.
- Verifier qu'une note avec tags se serialize correctement dans la reponse tRPC.

## Risques
- Divergence entre schema local et remote (migrations non appliquees).
- Conflits non deterministes si tie-break non formalise.
- Tags partiellement supportes (lecture seule) pouvant surprendre l'UI.

## Rollout
- Etape 1: appliquer la migration Prisma sur un environnement de test.
- Etape 2: activer `/changes` en validation locale, puis staging.
- Etape 3: activer attachments + hash check sur un dataset reduit.

## Estimation (ordre de grandeur)
- Migrations + tests serveur: 0.5-1j
- Tags ecriture + tests: 0.5-1.5j
- Conflits + docs: 0.25-0.5j
- Tests integration sync: 0.5-1j

## Recherche web
- Non effectuee (non necessaire pour ce plan).

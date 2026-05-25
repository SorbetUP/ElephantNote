# Plan — Bouton “reset” ne fait rien (reset complet user)

## Objectif

Rendre le bouton **“Réinitialiser mes données”** fonctionnel dans les **paramètres** avec double confirmation, en particulier en **mode offline/local (Tauri)**, et faire un **reset complet** de tout ce qui est lié à l’utilisateur :

- compte utilisateur (au moins “profil/état local”, voire suppression de compte selon choix)
- settings/configs
- ressources (attachments + fichiers)
- notes (Blinko / tâches / notes / archives / corbeille)
- tags et relations
- sync state / oplog / outbox / conflits
- conversations/messages, notifications, follows (si présent)

## Contexte repo (ce que j’ai trouvé)

- UI du bouton + dialogue:
  - `app/src/components/BlinkoSettings/BasicSetting.tsx`
  - `app/src/components/BlinkoSettings/ResetMyDataDialog.tsx`
- Côté serveur (mode “serveur” / Postgres): mutation ajoutée:
  - `server/routerTrpc/task.ts` → `task.resetMyData`
  - helper DB: `server/lib/reset_account_data.ts`
- En mode offline/local, les appels tRPC passent par le handler Rust:
  - `app/src-tauri/src/local_api/handlers_trpc.rs`
- Or `task.resetMyData` n’est **pas géré** dans `handle_task(...)` ⇒ retombe dans `default_response(...)` qui renvoie `{"ok": true}` sans effet.
  - Résultat: le bouton “réussit” côté UI mais ne supprime rien ⇒ “ne fait rien”.
- Les tables SQLite locales pertinentes sont définies dans:
  - `app/src-tauri/migrations/0001_init.sql` (`notes`, `tags`, `note_tags`, `attachments`, `oplog`, `outbox`, `conflicts`, `sync_state`, `settings`)

## Hypothèses

- L’utilisateur est en mode offline/local (Tauri), donc **pas de Postgres** et pas de code Node côté serveur pour ce reset.
- “Reset soi-même” signifie: supprimer **tout** (DB + fichiers + settings/configs) lié à l’utilisateur, et remettre l’app dans un état “premier lancement” pour cet utilisateur.
- En mode local, il n’y a pas de table `accounts` : l’“identité” passe par `local_user` + `local_config.json` + la table SQLite `settings`.

## Scope

### Inclus
- Implémenter `task.resetMyData` côté **local_api (Rust)**.
- Supprimer les fichiers dans `attachments_dir` liés aux entrées `attachments.path` (et idéalement purge complète du dossier).
- Reset des settings/configs locales (SQLite `settings` + `local_user` + potentiellement `local_config.json`).
- Rafraîchir l’UI après succès (vidage des listes/états en mémoire).

### Exclu (sauf demande)
- Reset “multi-comptes” (offline local semble mono-user).

## Point de décision (1 question)

Le reset doit-il **supprimer le compte** (et forcer une recréation/reconnexion), ou **conserver le compte** et seulement vider toutes ses données ?

- Option A (recommandée): conserver le compte, mais reset total data/settings/resources/sync.
- Option B: supprimer le compte (plus risqué côté auth/tokens; nécessite une UX claire + potentiellement invalider le token).

## Plan technique

### 1) Reproduction & diagnostic rapide

- [ ] Vérifier si l’appel réseau `task.resetMyData` part bien vers l’API locale (`/api/trpc`) ou vers le serveur.
- [ ] Dans la console/log, confirmer la réponse actuelle: `{"ok": true}` sans changements DB.
- [ ] Confirmer le mode d’exécution:
  - offline/local: implémenter Rust
  - serveur: implémenter Node (déjà fait) + vérifier que le serveur est bien redémarré

### 2) Implémentation offline/local (Rust) — reset complet

Fichiers:
- [ ] `app/src-tauri/src/local_api/handlers_trpc.rs`

Changements attendus:
- [ ] Ajouter un match arm dans `handle_task(...)` pour `"resetMyData"`.
- [ ] Parser `confirmPhrase` (string) et refuser si différent de `RESET` (case-insensitive).
- [ ] Collecter les paths à supprimer depuis `attachments.path` (avant suppression DB).
- [ ] Exécuter une transaction SQL (ordre recommandé):
  - [ ] `DELETE FROM note_tags;`
  - [ ] `DELETE FROM tags;`
  - [ ] `DELETE FROM attachments;`
  - [ ] `DELETE FROM notes;`
  - [ ] `DELETE FROM oplog;`
  - [ ] `DELETE FROM outbox;`
  - [ ] `DELETE FROM conflicts;`
  - [ ] `DELETE FROM sync_state;`
  - [ ] `DELETE FROM settings;` (reset settings)
- [ ] Reset “compte local”:
  - [ ] appeler `local_user::clear_local_user(...)` (efface l’utilisateur local)
  - [ ] décider si on supprime aussi `paths.config_path` (factory reset complet)
- [ ] Supprimer les fichiers sur disque:
  - [ ] Pour chaque `attachments.path`, résoudre `attachments_dir.join(path)` (en validant qu’on reste bien dans `attachments_dir`) puis `remove_file`.
  - [ ] Compter les suppressions et les erreurs (fichiers manquants = non bloquant).
- [ ] Purge complète du dossier `attachments_dir` (recommandé pour éviter les orphelins).
- [ ] Retourner un JSON utile (ex: `deleted: { notes, tags, attachments }, files: { total, failed }`).
- [ ] Après reset, forcer une “déconnexion” côté app (ex: emit event `user:signout` ou navigation vers `/signin`).

### 3) Alignement UI (si nécessaire)

Fichiers:
- [ ] `app/src/components/BlinkoSettings/ResetMyDataDialog.tsx`
- [ ] `app/src/components/BlinkoSettings/BasicSetting.tsx`

Changements possibles:
- [ ] Afficher un message d’erreur clair si l’API locale renvoie une erreur.
- [ ] Après succès: forcer un refresh plus “fort” si des caches persistent (ex: `RootStore.Get(BlinkoStore).refreshData()` + éventuellement navigation vers la liste).
- [ ] Optionnel: afficher un résumé “X notes supprimées”.

### 4) Mode serveur (Node) — reset complet user

- [ ] Vérifier que `task.resetMyData` est bien exposé (router `taskRouter` inclus dans `server/routerTrpc/_app.ts`).
- [ ] Étendre le reset serveur pour couvrir “tout ce qui est lié à l’user” (au minimum):
  - [ ] `notes`, `attachments`, `tags`, `tagsToNote`, `noteReference`, `comments`, `noteHistory`, `noteInternalShare`
  - [ ] `syncChanges`
  - [ ] `conversation` + `message`
  - [ ] `notifications`, `follows`
  - [ ] `config` (userId = accountId)
  - [ ] `aiScheduledTask` (accountId)
- [ ] (selon décision Option A/B): reset du profil (image, nickname, description, apiToken, etc.) OU suppression du compte.
- [ ] Tester sur un compte: le reset supprime bien data + fichiers (local/S3).

## Checklist exécutable

- [ ] Ajouter `task.resetMyData` dans `app/src-tauri/src/local_api/handlers_trpc.rs`.
- [ ] Ajouter une fonction helper dédiée (si code trop long) ex: `app/src-tauri/src/local_api/reset_my_data.rs`.
- [ ] Ajouter un test Rust (idéal) ou une procédure de validation manuelle documentée.
- [ ] Vérifier que l’UI indique clairement succès/échec.

## Tests / Validation

### Validation manuelle (offline/local)

- [ ] Créer 2 notes + 1 tag + 1 pièce jointe (image) + changer un setting.
- [ ] Cliquer “Réinitialiser mes données”, taper `RESET`, cocher, confirmer.
- [ ] Vérifier:
  - [ ] liste de notes vide
  - [ ] liste de tags vide
  - [ ] pièces jointes supprimées du disque (`attachments_dir`)
  - [ ] settings remis à zéro (et/ou `local_config.json` selon option)
  - [ ] utilisateur local “déconnecté” (si reset compte demandé)
  - [ ] aucune erreur visible côté UI

### Validation manuelle (serveur)

- [ ] Même scénario sur une instance serveur (Postgres) + vérifier suppression DB + fichiers.

### Test automatique (recommandé)

- [ ] Rust: test avec SQLite temporaire (appliquer migrations), insérer lignes + créer fichiers + settings, appeler le reset, assert tables vides + fichiers supprimés + settings vides.

## Risques

- Suppression de fichiers: éviter tout path traversal (ne jamais supprimer en dehors de `attachments_dir`).
- UX: “Reset” doit rester clairement destructif, limiter les faux positifs (double confirmation).
- Sync: sans nettoyage `oplog/outbox/sync_state`, risque de réinjection au prochain sync.
- Option B (suppression compte): risque de tokens encore “valides” côté client si la validation ne dépend pas de la DB.

## Rollout / rollback

- Rollout: derrière le même bouton; impact limité au compte/local store.
- Rollback: revert du handler `resetMyData` + du bouton UI si besoin.

## Estimation

- Diagnostic: 15–30 min
- Implémentation Rust + validation manuelle: 1–2 h
- Ajout test Rust + stabilisation: 1–2 h

# Plan d'action Atomic pour ElephantNote

## Objectif

Faire evoluer ElephantNote depuis la base MarkText/Muya vers une application de connaissances locale, offline-first, avec une interface plus simple inspiree d'Obsidian, Google Keep et Atomic, tout en conservant les acquis deja ajoutes au projet.

## Lecture des projets

- Base actuelle: Electron, Vue 3, Pinia, Muya, recherche locale, import Google Keep, Excalidraw, preview de site statique, agents, sync Git-like.
- Atomic clone: Rust/Tauri/React, atoms markdown, sqlite-vec, recherche semantique, auto-tagging, canvas graph, wiki synthesis avec citations, chat agentique RAG, MCP, RSS/web clipper, multi-database, apps mobiles.
- Blinko-offline local: reference utile pour les imports, le stockage offline, les contraintes mobile et le mode local.

## Phase 1 - Interface desktop compacte

- Remplacer les gros onglets de vault par un select compact dans la barre haute.
- Remplacer la grande recherche par un bouton icone qui ouvre la recherche existante.
- Garder `All notes` comme entree principale.
- Deplacer la creation de note et dossier dans la colonne laterale, au-dessus de `All notes`.
- Ne plus afficher les dossiers au centre: le centre affiche les notes, les dossiers vivent dans l'arborescence laterale.
- Garder `Recently edited`, mais en version compacte et en bas de la colonne.
- Ajouter des icones rapides: recherche, graph, calendrier, parametres.
- Conserver Muya et la surcouche visuelle existante pour l'edition.
- Conserver Excalidraw, l'edition d'images, l'import Google Keep, la preview de site depuis dossier, les agents et la sync deja presents.

## Phase 2 - Arborescence Obsidian/Atomic

- Afficher la racine du vault dans la colonne gauche.
- Deplier les dossiers dans la colonne au lieu de naviguer par cartes centrales.
- Garder les notes visibles dans l'arbre pour une navigation type Obsidian.
- Ajouter les actions contextuelles: nouvelle note dans dossier, nouveau dossier, renommer, supprimer, deplacer, epingler.
- Ajouter un etat vide clair pour les dossiers sans notes.
- Synchroniser l'arbre avec l'editeur ouvert et la recherche.

## Phase 3 - Recherche et structuration Atomic

- Mettre en place un index hybride: mots-cles, tags, embeddings.
- Ajouter la recherche par meaning avec seuils configurables.
- Chunker automatiquement les notes et documents.
- Ajouter l'auto-tagging hierarchique.
- Creer des liens semantiques entre notes.
- Ajouter des sources integrees: URL, RSS, PDF, docs, images OCR, clipboard, partage mobile.
- Exposer les citations dans les resultats et les vues wiki.
- Ajouter un statut d'indexation visible dans les parametres.

## Phase 4 - Dashboard, wiki et graph

- Ajouter un dashboard Atomic: notes recentes, travaux d'indexation, imports, taches, sources, suggestions.
- Ajouter une vue wiki: synthese markdown par dossier/tag/sujet avec citations.
- Ajouter un flux de proposition de mise a jour wiki: proposer, accepter, rejeter.
- Ajouter un graph plein ecran avec zoom, pan, filtre, clusters et positions persistantes.
- Ajouter un canvas spatial pour organiser notes, sources, images et documents.
- Garder une version legere sur mobile sans execution de gros modeles.

## Phase 5 - IA, agents, MCP et modeles

- Ajouter une page Modeles avec choix separes: embedding, chat, tagging, wiki, speech-to-text, text-to-speech.
- Supporter Ollama, OpenAI-compatible, OpenRouter et fournisseurs locaux integres.
- Proposer des modeles telechargeables directement dans l'app pour un mode "sans configuration".
- Ajouter chat agentique RAG avec citations et outils de recherche.
- Ajouter integration MCP locale pour lire, chercher, creer, mettre a jour et ingester des notes.
- Ajouter une zone agents/API/plugins pour connecter LLM, agents externes et workflows.
- Ajouter des environnements executables depuis notes/wiki/dashboard, avec isolation et permissions explicites.

## Phase 6 - Audio

- Ajouter speech-to-text: Whisper Turbo, Whisper Large, Parakeet v2 et providers compatibles.
- Ajouter text-to-speech: Kokoro, Kitten, Supertonic ou equivalents sous licence permissive.
- UI: bouton micro dans l'editeur, transcription en panneau lateral, insertion au curseur, lecture selection/note, file d'attente audio.
- Parametres: modele actif, langue, qualite, emplacement de cache, acceleration materielle.

## Phase 7 - Imports et plugins

- Import Google Keep complet: notes, couleurs, images, labels, archives si disponibles.
- Imports Obsidian, Markdown dossier, PDF, HTML, RSS, web clipper.
- Import Google Calendar pour migration initiale.
- Plugin Google Calendar: OAuth, sync bidirectionnelle, conflits, mapping event-note.
- Definir une API plugin: manifest, permissions, UI slots, commandes, taches planifiees, stockage local, migrations.
- Fournir un premier SDK plugin et des tests de contrat.

## Phase 8 - Calendrier et taches programmatiques

- Ajouter une icone calendrier en haut.
- Creer un vrai calendrier type Google Calendar: mois, semaine, jour, agenda, recherche.
- Lier notes et evenements.
- Ajouter une zone de taches programmatiques inspiree de Codex: creation, recurrence, statut, historique d'execution.
- Les taches doivent pouvoir appeler imports, agents, recherche, wiki, sync et plugins.

## Phase 9 - Sync offline-first

- Ne pas utiliser le code Syncthing a cause de la licence.
- Concevoir une sync inspiree de Git: log compact d'operations, snapshots, hash de contenu, resolution de conflits.
- Chiffrer optionnellement les donnees.
- Supporter LAN, dossier partage, serveur personnel et transport plugin.
- Garder le stockage local comme source utilisable sans reseau.

## Phase 10 - Android

- Construire une app Android offline-first inspiree de Google Keep: grille compacte, couleurs sobres, recherche rapide, capture.
- Adapter l'interface au projet: vault, dossiers, notes, tags, graph leger, wiki lecture.
- Stocker les donnees localement sur Android.
- Supporter `Partager vers`: recevoir texte, URL, image, PDF, ouvrir un panneau au-dessus de l'app, proposer note/dossier/tags.
- Ne pas faire tourner les gros modeles localement sur mobile au depart; deleguer au desktop/serveur/local provider.

## Contraintes licence

- N'utiliser que du code compatible MIT/BSD/Apache-2.0/ISC ou licences commerciales permissives.
- Syncthing peut inspirer l'architecture, mais aucun code ne doit etre repris.
- Toute brique importee doit etre repertoriee avec licence, version et usage.

## Tests a maintenir

- Store: arborescence racine, notes centrales sans dossiers, creation racine, recentes, vault switch.
- UI: topbar compacte, boutons recherche/graph/calendrier/settings, creation note/dossier laterale.
- Recherche: indexation, fallback keyword, statut, rebuild.
- Imports: Google Keep, dossier markdown, calendrier.
- Sync: log operations, conflits, replay, compactage.
- Mobile: stockage offline, share intent, rendu minimal.

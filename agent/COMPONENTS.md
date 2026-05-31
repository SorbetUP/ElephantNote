# Composants ElephantNote

## Shell principal

- `AppShell.vue`: layout global, theme, largeur sidebar, raccourci recherche. Garde la topbar horizontale et la sidebar verticale visibles hors mode focus.
- `TopVaultBar.vue`: barre superieure, vault actif, recherche, reglages. La zone vide de la topbar sert aussi de zone de drag Electron; les boutons et champs doivent rester en `no-drag`.
- `SidebarNav.vue`: navigation laterale et notes recentes. `Recently edited` reste ancre en bas de la sidebar quand la hauteur le permet.
- `MainContent.vue`: zone centrale qui choisit grille, editeur ou vue workspace (Dashboard, Chat, Wiki, Calendar, Graph, Canvas).
- `EmptyVaultPicker.vue`: etat initial sans vault.
- `SettingsPanel.vue`: panneau de reglages complet (1790 lignes). Sections: vault, recherche, site preview, agents AI, RAG, MCP, modeles locaux, plugins, taches, programmes, sync Git, fonctionnalites, config AI, atomic notes, import Google Keep/Calendar, sources, wiki.

## Vues workspace

- `DashboardView.vue`: vue d'ensemble du vault (stats notes/dossiers/tags, recentes, populaires).
- `ChatView.vue`: chat RAG avec citations de notes locales. Reponses ancreees dans le vault actif.
- `WikiView.vue`: propositions de pages wiki synthetisees a partir de notes citees. Actions: proposer, accepter, rejeter.
- `CalendarView.vue`: evenements offline + notes groupees par date de derniere edition. Import Google Calendar.
- `GraphView.vue`: graphe de connaissances (noeuds = notes/dossiers, aretes = dossiers partagés/tags).
- `CanvasView.vue`: canvas libre avec zoom et noeuds deconnectes.

## Bibliotheque

- `LibraryToolbar.vue`: filtres, tri, mode d'affichage, actions.
- `LibraryGrid.vue`: liste des entrees.
- `NoteCard.vue`: carte note. Le clic sur la carte ou son titre doit ouvrir la note en un seul clic; garder le double-clic pour renommer.
- `FolderCard.vue`: carte dossier. Le clic sur la carte ou son titre doit ouvrir le dossier; garder une icone compacte pour ne pas dominer la grille.
- `SidebarTreeEntry.vue`: entree de sidebar recursive.

## Editeur de note

- `NoteEditorHost.vue`: orchestration de l'editeur, pont vers MarkText/Muya, sauvegarde, Excalidraw.
- `NoteEditorHeader.vue`: titre, pin/unpin, fermeture.
- `NoteEditorMeta.vue`: date, tags, ajout/edition/suppression de tags.
- `NoteEditorToolbar.vue`: actions Markdown.
- `NoteEditorFooter.vue`: compteurs, taille de texte, theme.
- `NoteTagChip.vue`: affichage et actions d'un tag individuel.
- `NoteTagForm.vue`: formulaire inline de creation/edition de tag.
- `NoteTypographyMenu.vue`: menu de densite typographique de l'editeur.
- `ExcalidrawDialog.vue`: edition/insertion d'image Excalidraw.

Regle: si une modification concerne seulement le visuel ou les boutons du header/meta/footer, modifier le sous-composant correspondant. Ne pas grossir `NoteEditorHost.vue` sauf pour changer l'orchestration.

Separation attendue:

- `MainContent.vue`: affiche soit la bibliotheque, soit l'editeur dans le panneau central; ne doit pas masquer la topbar ou la sidebar.
- `NoteEditorHost.vue`: coordination avec stores, sauvegarde, events bus, Excalidraw.
- `NoteEditorHeader.vue`: aucune logique markdown, seulement titre/pin/close.
- `NoteEditorMeta.vue`: assemble date, tags et formulaire, sans parser le markdown.
- `NoteTagChip.vue`: un tag, deux actions.
- `NoteTagForm.vue`: input controle, submit/cancel.
- `NoteEditorFooter.vue`: assemble compteurs/actions footer.
- `NoteTypographyMenu.vue`: popover typo uniquement.

## Recherche

- `SearchModal.vue`: conteneur principal de recherche.
- `SearchResultItem.vue`: rendu d'un resultat.
- `SearchSettingsPanel.vue`: reglages et inspection d'index.
- `SearchStatusBadge.vue`: etat de l'index.
- `stores/searchStore.js`: etat et appels API recherche.

## Site preview

- `SitePreviewPanel.vue`: panneau de preview.
- `SitePreviewToolbar.vue`: actions preview/build/open.
- `sitePreviewStore.js`: etat preview.

## Services renderer

- `services/elephantnoteClient.js`: client unifie pour toutes les API ElephantNote. Utilise `window.elephantnote.api.call` avec fallback legacy. Expose des namespaces: `vaults`, `directory`, `notes`, `folders`, `sidebar`, `entries`, `imports`, `calendar`, `sources`, `wiki`, `search`, `sitePreview`, `features`, `ai`, `atomic`, `models`, `plugins`, `tasks`, `agents`, `rag`, `mcp`, `programs`, `sync`.
- `services/excalidraw.js`: integration Excalidraw.
- `services/markdownMetaService.js`: extraction et gestion des metadonnees Markdown.

## Utils

- `utils/markdownTags.js`: gestion des tags.
- `utils/noteDocument.js`: transformation document <-> editeur.
- `utils/noteCardView.js`: helpers de cartes.
- `utils/dom.js`: helpers DOM.
- `utils/categoryActions.js`: actions par categorie de vue.

## Stores

- `stores/vaultStore.js`: vault actif, entrees, notes ouvertes, pins, CRUD notes/dossiers. Gere aussi l'etat des vues workspace (wiki, calendar, graph, dashboard).
- `stores/searchStore.js`: recherche exacte/semantique, index, preferences.

## Points de vigilance performance

- `MainContent.vue` doit afficher l'editeur des que `openedNotePath` existe, sans attendre que tout le contenu soit relu, afin de donner un feedback immediat.
- `stores/vaultStore.js` doit ignorer une ouverture si la note demandee est deja ouverte; cela evite les rechargements et les doubles clics ressentis.
- `NoteTagForm.vue` doit emettre les deux variantes Vue `update:modelValue` et `update:model-value`, car les parents peuvent ecouter l'une ou l'autre selon la convention du template.
- `src/muya/lib/contentState/paragraphCtrl.js` doit tolerer une selection dont le bloc source n'existe plus apres une frappe ou une re-renderisation; ne pas relancer une erreur renderer pour un bloc `null`.

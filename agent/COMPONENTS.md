# Composants ElephantNote

## Shell principal

- `AppShell.vue`: layout global, theme, largeur sidebar, raccourci recherche.
- `TopVaultBar.vue`: barre superieure, vault actif, recherche, reglages.
- `SidebarNav.vue`: navigation laterale et notes recentes.
- `MainContent.vue`: zone centrale qui choisit grille ou editeur.
- `EmptyVaultPicker.vue`: etat initial sans vault.

## Bibliotheque

- `LibraryToolbar.vue`: filtres, tri, mode d'affichage, actions.
- `LibraryGrid.vue`: liste des entrees.
- `NoteCard.vue`: carte note.
- `FolderCard.vue`: carte dossier.
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

## Stores

- `stores/vaultStore.js`: vault actif, entrees, notes ouvertes, pins, CRUD notes/dossiers.
- `stores/searchStore.js`: recherche exacte/semantique, index, preferences.

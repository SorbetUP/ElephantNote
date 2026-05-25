J’ai vérifié les points structurants du repo MarkText, pas chaque fichier un par un. Pour ce que tu veux, il ne faut pas demander à Codex de “modifier l’interface” vaguement : il faut lui demander de créer une **nouvelle shell applicative ElephantNote** autour du moteur d’édition MarkText.

MarkText est déjà une bonne base parce que c’est une app Electron Markdown cross-platform, avec édition WYSIWYG, CommonMark/GFM, KaTeX, front matter, export HTML/PDF, thèmes, modes source/typewriter/focus et collage d’images. ([GitHub][1]) Le projet est sous licence MIT, donc c’est cohérent pour repartir du code et faire ton fork. ([GitHub][1]) Son architecture est séparée en `common`, `main`, `muya`, `renderer`, avec Electron côté main/renderer, Vue 3 + Pinia côté UI, et Muya comme moteur d’édition Markdown temps réel. ([GitHub][2]) Le `package.json` actuel confirme aussi Node >= 20.19, pnpm >= 10, electron-vite, Vue, Pinia, Electron Builder, Playwright/Vitest, ainsi que des dépendances utiles comme `chokidar`, `electron-store`, `@vscode/ripgrep`, `dompurify`, `codemirror`, `@marktext/file-icons`. ([GitHub][3])

Voici la doc claire à donner à Codex.

---

# Cahier des charges technique — ElephantNote à partir de MarkText

## 1. Objectif général

Renommer le fork MarkText en **ElephantNote** et transformer l’application d’un simple éditeur Markdown en une application de notes structurée par **vaults**, **catégories**, **dossiers**, **notes** et plus tard fichiers externes.

Le moteur d’édition Markdown de MarkText doit être conservé au début. Il ne faut pas réécrire Muya. Muya doit rester l’éditeur WYSIWYG utilisé quand une note est ouverte. L’objectif V0 est de refaire la **coquille graphique et organisationnelle** autour de l’éditeur.

MarkText gère déjà une sidebar avec explorateur de fichiers, recherche dans les fichiers et table des matières, ainsi qu’un fonctionnement par dossier racine ouvert. ([GitHub][4]) ElephantNote doit aller plus loin : plusieurs vaults visibles dans la barre supérieure, une sidebar de catégories personnalisées, et une vue centrale en grille de notes/dossiers inspirée de l’image fournie.

---

# 2. Terminologie obligatoire

## Vault

Un **vault** est un dossier racine local choisi par l’utilisateur.
Exemple :

```txt
~/Documents/ElephantNote/Personal
~/Documents/ElephantNote/Work
~/Documents/ElephantNote/Research
```

Chaque vault contient ses notes, dossiers, assets et métadonnées.

Dans l’interface, les éléments de la barre horizontale du haut comme `Guides`, `Recipes`, `API Reference`, etc. représentent des **vaults**, pas des pages web.

## Note

Une note est un fichier Markdown `.md`.

Format minimal :

```md
---
title: "Welcome to ElephantNote"
type: "note"
tags: ["getting-started"]
createdAt: "2026-05-17T00:00:00.000Z"
updatedAt: "2026-05-17T00:00:00.000Z"
---

# Welcome to ElephantNote
```

Pour le MVP, le titre peut être lu depuis le frontmatter ou depuis le premier `# H1`.

## Dossier

Un dossier est un dossier physique dans le vault.

Exemple :

```txt
Research/
Research/LLM/
Research/LLM/WorldModels.md
```

## Catégorie sidebar

Une catégorie sidebar est un groupe visuel créé par l’utilisateur.

Exemple :

```txt
Getting started
ReadMe AI
Writing Docs
Syncing Docs
Version Control
```

Dans la V0, une catégorie peut pointer vers un chemin physique du vault ou vers une collection simple définie dans `.elephantnote/workspace.json`.

Ne pas implémenter un système de tags complexe dès le début. Pour éviter que Codex parte dans tous les sens, la V0 doit traiter les catégories comme des **vues de navigation configurées**, pas encore comme un vrai moteur de requêtes.

## Section / item sidebar

Un item sous une catégorie est un dossier, une note, ou une vue filtrée.

Exemple :

```txt
ReadMe AI
  Agent
  Linter
  MCP
```

---

# 3. Comportement au premier lancement

## Cas 1 — aucune vault configurée

Au premier lancement, l’interface doit être vide.

Afficher seulement un écran central propre :

```txt
[logo ElephantNote]

Choose your first vault
Select a folder where ElephantNote will store your notes.

[ Choose vault ]
```

Contraintes UI :

* fond blanc ou très légèrement gris ;
* carte centrale avec bordure fine ;
* bouton bleu dans le style de l’image ;
* pas de sidebar ;
* pas de barre de notes ;
* pas de faux contenu de démonstration.

Action du bouton :

* ouvrir un sélecteur de dossier natif Electron ;
* enregistrer le chemin dans la config globale ;
* créer la structure minimale du vault ;
* charger l’interface principale.

---

# 4. Structure disque à créer dans chaque vault

À la sélection d’une nouvelle vault, créer :

```txt
<VaultRoot>/
  .elephantnote/
    workspace.json
    index.json
  Getting Started/
    Welcome to ElephantNote.md
```

`workspace.json` minimal :

```json
{
  "version": 1,
  "vaultName": "Personal",
  "sidebar": [
    {
      "id": "getting-started",
      "title": "Getting started",
      "icon": "box",
      "collapsed": false,
      "items": [
        {
          "id": "welcome-to-elephantnote",
          "title": "Welcome to ElephantNote",
          "type": "folder",
          "path": "Getting Started",
          "icon": "cube"
        }
      ]
    }
  ]
}
```

La config globale app, hors vault, stocke la liste des vaults :

```json
{
  "vaults": [
    {
      "id": "personal",
      "name": "Personal",
      "path": "/absolute/path/to/vault",
      "icon": "book",
      "lastOpenedAt": "..."
    }
  ],
  "activeVaultId": "personal"
}
```

Utiliser `electron-store` ou le système de préférences existant de MarkText pour stocker cette config globale.

---

# 5. Interface cible selon l’image

## Layout global

L’interface principale est composée de 3 zones :

```txt
┌──────────────────────────────────────────────────────────────┐
│ TopVaultBar                                                   │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ MainContent                                  │
│               │                                              │
│               │ Grid / Editor                                │
└───────────────┴──────────────────────────────────────────────┘
```

## TopVaultBar

Contenu :

1. logo ElephantNote à gauche ;
2. liste horizontale des vaults ;
3. bouton `+` visible au hover après le dernier vault ;
4. search box mockée ;
5. bouton `Ask AI` mocké ;
6. boutons contextuels : `New note`, `New folder`, `Sort`, toggle grid/list.

Le logo doit ouvrir les paramètres existants de l’application. Pour l’instant, connecter vers la fenêtre/settings existante de MarkText, sans créer une nouvelle page paramètres complète.

Le bouton `Ask AI` doit être visible mais désactivé ou afficher un toast :

```txt
AI features are not available yet.
```

La recherche peut utiliser une recherche basique par nom de fichier ou être mockée proprement. Ne pas implémenter de recherche intelligente maintenant.

## Sidebar gauche

Supprimer complètement le bloc `Workspace Pro`.

La sidebar contient :

```txt
Getting started
  Welcome to ElephantNote

[+ Add category]
```

Plus tard, elle pourra contenir :

```txt
ReadMe AI
  Agent
  Linter
  MCP

Writing Docs
  Built-in Components
  Reusable Content
```

Comportements requis :

* catégories repliables/dépliables ;
* création de catégorie ;
* création de dossier/item sous une catégorie ;
* icône optionnelle par catégorie et item ;
* état actif visuel clair ;
* hauteur compacte ;
* pas de gros espaces vides ;
* pas d’éléments marketing.

## MainContent

Deux modes :

### Mode library/grid

Quand on clique sur un dossier ou une catégorie contenant plusieurs notes/dossiers, afficher une grille de cartes.

En haut :

```txt
Notes   v

[All] [Notes] [Articles] [Folders]

[New note] [New folder] [Sort by: Updated newest] [grid/list]
```

Cartes :

* carte dossier avec icône dossier bleue, titre, nombre de notes, updated date ;
* carte note avec date, titre, extrait Markdown rendu, tags, type ;
* image de couverture si la note contient une image utilisable ;
* menu `...` en haut à droite ;
* tailles légèrement variables, mais alignées et professionnelles.

Il faut éviter le rendu trop uniforme. Utiliser une grille avec une hiérarchie visuelle :

* dossiers plus compacts que dans l’image actuelle ;
* notes importantes peuvent prendre 2 colonnes ;
* notes simples en 1 colonne ;
* pas de grands espaces vides ;
* gap entre cartes : environ 14–18 px ;
* border-radius : 14–18 px ;
* bordure gris clair ;
* shadow très légère.

CSS conseillé :

```css
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}

.card.is-featured {
  grid-column: span 2;
}

.folder-card {
  min-height: 126px;
}

.note-card {
  min-height: 160px;
}
```

Prévoir un comportement responsive :

```css
@media (max-width: 900px) {
  .sidebar {
    display: none;
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .card.is-featured {
    grid-column: span 1;
  }
}
```

### Mode note/editor

Quand un dossier ou une catégorie ne contient qu’une seule note, ou quand l’utilisateur ouvre directement une note :

* afficher la note en grand ;
* utiliser l’éditeur MarkText existant ;
* la note prend tout l’espace central ;
* sidebar et topbar restent visibles ;
* sauvegarde normale via le système MarkText existant.

---

# 6. Architecture de code recommandée

Ne pas disperser les modifications dans tout MarkText.

Créer un module clair :

```txt
src/renderer/elephantnote/
  components/
    AppShell.vue
    EmptyVaultPicker.vue
    TopVaultBar.vue
    SidebarNav.vue
    SidebarCategory.vue
    MainContent.vue
    LibraryToolbar.vue
    LibraryGrid.vue
    NoteCard.vue
    FolderCard.vue
    NoteEditorHost.vue
    IconPicker.vue
  stores/
    vaultStore.js
    workspaceStore.js
    libraryStore.js
    selectionStore.js
    uiStore.js
  services/
    vaultIndexService.js
    markdownMetaService.js
    sortService.js
    pathService.js
  styles/
    tokens.css
    app-shell.css
    sidebar.css
    library-grid.css
```

Côté Electron main/preload :

```txt
src/main/elephantnote/
  vaults.js
  filesystem.js
  indexer.js
  watchers.js

src/preload/elephantnote.js
```

IPC minimal :

```ts
elephantnote:selectVault
elephantnote:getVaults
elephantnote:setActiveVault
elephantnote:initVault
elephantnote:listDirectory
elephantnote:createNote
elephantnote:createFolder
elephantnote:readNote
elephantnote:writeNote
elephantnote:watchVault
```

Règle importante : le renderer ne doit pas accéder directement au filesystem. Toutes les opérations disque passent par IPC.

Sécurité obligatoire :

* vérifier que chaque chemin est bien dans le vault actif ;
* bloquer `../` et path traversal ;
* ignorer `.git`, `node_modules`, `.elephantnote`, fichiers temporaires ;
* debounce sur les watchers ;
* ne pas indexer tout le disque.

---

# 7. To-do list technique par phases

## Phase 0 — Fork et renommage

* Remplacer le nom visible `MarkText` par `ElephantNote`.
* Modifier `package.json`, metadata Electron Builder, icônes, nom de fenêtre.
* Conserver la licence MIT et les mentions nécessaires.
* Vérifier que `pnpm install`, `pnpm dev`, `pnpm build` fonctionnent encore.
* Ne pas toucher Muya sauf si nécessaire pour brancher l’éditeur.

## Phase 1 — Nouvelle AppShell

* Créer `AppShell.vue`.
* Remplacer l’écran principal par :

  * `EmptyVaultPicker` si aucune vault ;
  * `TopVaultBar + SidebarNav + MainContent` si une vault existe.
* Garder les préférences MarkText accessibles depuis le logo.
* Supprimer ou masquer les éléments MarkText incompatibles avec la nouvelle shell.
* Supprimer le bloc `Workspace Pro`.

## Phase 2 — Vault manager

* Implémenter sélection de dossier via Electron.
* Créer `.elephantnote/workspace.json`.
* Créer `Getting Started/Welcome to ElephantNote.md`.
* Stocker la liste des vaults globalement.
* Afficher les vaults dans la barre du haut.
* Ajouter le bouton `+` au hover après le dernier vault.
* Permettre de switcher de vault sans redémarrer l’app.

## Phase 3 — Sidebar catégories

* Lire les catégories depuis `workspace.json`.
* Afficher `Getting started > Welcome to ElephantNote`.
* Ajouter création de catégorie.
* Ajouter création de dossier sous catégorie.
* Ajouter état actif.
* Ajouter collapse/expand.
* Prévoir champ `icon`, même si l’icon picker est simple au début.

## Phase 4 — Library grid

* Scanner le dossier actif.
* Construire une liste :

  * dossiers ;
  * notes `.md`.
* Extraire :

  * title ;
  * date created/updated ;
  * excerpt ;
  * tags ;
  * première image éventuelle.
* Afficher les cartes selon l’image.
* Ajouter filtres `All`, `Notes`, `Articles`, `Folders`.
* Ajouter tri `Updated newest`, `Updated oldest`, `Title A-Z`.
* Ajouter toggle grid/list, même si list peut être basique.

## Phase 5 — Création note/dossier

* Bouton `New note` :

  * crée un `.md` dans le dossier courant ;
  * nom par défaut `Untitled.md`, `Untitled 2.md`, etc. ;
  * ouvre directement la note dans l’éditeur.
* Bouton `New folder` :

  * crée un dossier dans le dossier courant ;
  * met à jour la grille ;
  * met à jour la sidebar si nécessaire.
* Menu `...` sur carte :

  * placeholder pour rename/delete/move ;
  * ne pas implémenter tout si ce n’est pas demandé maintenant.

## Phase 6 — Intégration éditeur MarkText

* Réutiliser le composant ou le flux existant de MarkText pour ouvrir un fichier Markdown.
* Quand une note est sélectionnée depuis la grille, ouvrir le fichier avec l’éditeur existant.
* Garder l’autosave ou le comportement save existant.
* Ne pas casser les raccourcis Markdown.
* Ne pas transformer l’éditeur en simple textarea.

## Phase 7 — Polish UI

Créer des tokens CSS :

```css
:root {
  --en-bg: #ffffff;
  --en-sidebar-bg: #fbfcff;
  --en-border: #e7eaf0;
  --en-text: #101828;
  --en-muted: #667085;
  --en-primary: #1264ff;
  --en-radius-card: 16px;
  --en-radius-button: 12px;
  --en-sidebar-width: 292px;
  --en-topbar-height: 64px;
}
```

Respecter le style de l’image :

* blanc propre ;
* bordures fines ;
* ombres très légères ;
* typographie nette ;
* boutons arrondis ;
* bleu principal ;
* sidebar compacte ;
* cartes visuellement variées ;
* aucune zone vide énorme.

## Phase 8 — Tests

Ajouter tests minimaux :

* création première vault ;
* chargement `workspace.json` ;
* création note ;
* création dossier ;
* switch vault ;
* parsing metadata Markdown ;
* protection path traversal ;
* rendu empty state ;
* rendu library grid.

---

# 8. Ce qu’il ne faut pas faire maintenant

Ne pas implémenter maintenant :

* IA réelle ;
* recherche embedding ;
* PDF preview ;
* PowerPoint preview ;
* OCR ;
* sync cloud ;
* collaboration ;
* tags avancés ;
* marketplace/plugins ;
* workspace pro/paywall ;
* refonte complète de Muya ;
* système de base de données lourd.

La V0 doit rester locale, simple, stable, centrée sur notes/dossiers/vaults.

---

# 9. Critères d’acceptation V0

La tâche est réussie si :

1. au premier lancement, l’utilisateur voit seulement le bouton de choix de vault ;
2. après choix d’un dossier, l’app crée la structure minimale ;
3. la barre du haut affiche la vault active ;
4. on peut ajouter une autre vault via le bouton `+` ;
5. la sidebar affiche `Getting started > Welcome to ElephantNote` ;
6. le bloc `Workspace Pro` n’existe pas ;
7. la zone centrale affiche soit une grille, soit la note ouverte ;
8. `New note` crée une vraie note Markdown ;
9. `New folder` crée un vrai dossier ;
10. une note s’ouvre avec l’éditeur MarkText/Muya existant ;
11. search et Ask AI sont visibles mais mockés ;
12. le rendu global ressemble à l’image fournie : blanc, propre, compact, cartes organiques, pas de gros espaces vides.

---

# 10. Instruction directe à donner à Codex

Tu peux lui donner ce bloc tel quel :

```txt
You are working on a fork of marktext/marktext that must become ElephantNote.

Do not rewrite the Markdown editor engine. Keep Muya/MarkText editor behavior and build a new application shell around it.

Goal:
Implement the first ElephantNote UI and local vault system based on the provided design image.

Required behavior:
- First launch: show only an empty state with a centered "Choose vault" button.
- Choosing a vault opens a native folder picker.
- Initialize the selected folder with:
  .elephantnote/workspace.json
  Getting Started/Welcome to ElephantNote.md
- After vault selection, show the main app shell:
  top vault bar,
  left sidebar,
  central content area.
- Top bar:
  logo opens existing settings/preferences,
  vault tabs,
  add-vault button visible on hover after the last vault,
  basic search input mocked,
  Ask AI button mocked/disabled,
  New note,
  New folder,
  sort dropdown,
  grid/list toggle.
- Left sidebar:
  categories,
  collapsible sections,
  first category "Getting started",
  first item "Welcome to ElephantNote",
  no Workspace Pro block.
- Main content:
  if the selected location contains multiple notes/folders, show a card grid.
  if a single note is selected/opened, show the existing MarkText editor taking the whole central area.
- Cards must follow the provided design:
  white background,
  subtle borders,
  rounded corners,
  compact spacing,
  variable professional card sizes,
  note previews,
  folder cards,
  three-dot menu.
- New note creates a real .md file in the active folder and opens it.
- New folder creates a real directory in the active folder.
- Do not implement real AI, embedding search, PDF, PPT, OCR, cloud sync, or plugins yet.
- Keep filesystem access in Electron main/preload via IPC. Do not access fs directly from renderer.
- Validate all paths are inside the active vault.
- Add minimal tests for vault creation, note creation, folder creation, vault switching, and path safety.

Before coding, inspect the existing MarkText architecture and reuse existing editor/open-file behavior wherever possible.
```

---
V0 = dossiers physiques, V1 = vues/tags virtuels.

[1]: https://github.com/marktext/marktext "GitHub - marktext/marktext: A simple and elegant markdown editor, available for Linux, macOS and Windows. · GitHub"
[2]: https://github.com/marktext/marktext/blob/develop/docs/dev/ARCHITECTURE.md "marktext/docs/dev/ARCHITECTURE.md at develop · marktext/marktext · GitHub"
[3]: https://github.com/marktext/marktext/blob/develop/package.json "marktext/package.json at develop · marktext/marktext · GitHub"
[4]: https://github.com/marktext/marktext/blob/develop/docs/BASICS.md "marktext/docs/BASICS.md at develop · marktext/marktext · GitHub"

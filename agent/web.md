J’ai vérifié `docmd` : c’est cohérent avec ton besoin. Le projet `docmd-io/docmd` est MIT, il transforme des fichiers Markdown en site de documentation, il sait lancer un serveur local avec `docmd dev`, générer un site statique avec `docmd build`, et il a une recherche client-side basée sur MiniSearch. ([GitHub][1])
Pour ElephantNote, il ne faut pas demander à Codex de coder un générateur de site. Il faut lui demander de **brancher docmd localement** pour transformer un dossier de notes en site consultable.

---

# ElephantNote — Fonction “Afficher un dossier comme site web”

## 0. Objectif

Ajouter dans ElephantNote une fonction permettant de prendre un dossier de notes Markdown et de l’afficher comme un vrai site web local.

Exemple :

```txt id="pfl0nx"
Vault/
  Research/
    AI/
      index.md
      world-model.md
      embeddings.md
      assets/
        schema.png
```

L’utilisateur clique sur le dossier `AI`, puis sur :

```txt id="oel2me"
View as website
```

ElephantNote génère un site local avec `docmd`, puis l’affiche dans l’app ou dans le navigateur.

---

# 1. Règle principale

Ne pas coder un générateur de site maison.

Utiliser :

```bash id="y739t7"
pnpm add @docmd/core
```

`@docmd/core` doit être une dépendance runtime d’ElephantNote, pas seulement une dépendance de dev, car l’application doit pouvoir générer les sites localement.

Interdit :

```txt id="kjdh0a"
ne pas créer un renderer Markdown maison pour le site
ne pas créer un système de navigation maison
ne pas créer une recherche maison pour le site
ne pas envoyer les notes à un serveur
ne pas utiliser d’API cloud
ne pas utiliser de clé API
ne pas modifier les notes originales pour les rendre compatibles
```

---

# 2. Comportement utilisateur attendu

Dans la grille centrale ou la sidebar, quand l’utilisateur fait clic droit ou menu `...` sur un dossier :

```txt id="ykvwd0"
Open
Rename
New note
New folder
View as website
Build static website
```

## `View as website`

Lance une prévisualisation locale.

Comportement V1 recommandé :

```txt id="1fe6pz"
1. Préparer un projet docmd temporaire dans .elephantnote/site-previews/
2. Générer ou lancer le site localement
3. Afficher le site dans ElephantNote ou dans le navigateur
```

## `Build static website`

Génère un dossier statique exportable.

Exemple :

```txt id="w7k2a6"
<VaultRoot>/.elephantnote/site-builds/research-ai/
```

Plus tard, on pourra ajouter :

```txt id="jo2kfq"
Export to selected folder
Publish to GitHub Pages
Publish to server
```

Mais pas maintenant.

---

# 3. Approche technique recommandée

Il y a deux modes.

## Mode A — Preview locale

Utilisé par `View as website`.

```txt id="k5mw8l"
selected folder
   ↓
docmd config temporaire
   ↓
docmd dev ou build temporaire
   ↓
serveur local localhost
   ↓
affichage dans ElephantNote
```

## Mode B — Build statique

Utilisé par `Build static website`.

```txt id="n23o0c"
selected folder
   ↓
docmd build
   ↓
site statique dans .elephantnote/site-builds/
```

`docmd build` génère un site statique, et l’option `--offline` existe pour réécrire les liens afin de faciliter la navigation en `file://`. ([Docmd][2])

---

# 4. Emplacement des fichiers

Pour chaque vault :

```txt id="dqqqv9"
<VaultRoot>/
  .elephantnote/
    workspace.json
    search/
    site-previews/
      <site-id>/
        docmd.config.json
        tmp/
        site/
    site-builds/
      <site-id>/
        site/
```

Exemple :

```txt id="lce33y"
Vault/
  Notes/
    AI/
      index.md
      embeddings.md

  .elephantnote/
    site-previews/
      notes-ai/
        docmd.config.json
        tmp/
        site/
```

Les notes originales restent dans leur dossier d’origine.

Ne jamais déplacer les notes dans `.elephantnote`.

---

# 5. Dépendance docmd

Installer :

```bash id="bqbp9q"
pnpm add @docmd/core
```

Ne pas utiliser :

```bash id="wjnkr3"
npx @docmd/core dev
```

dans l’app finale.

Raison : `npx` peut télécharger des paquets à l’exécution. ElephantNote doit utiliser la version déjà installée avec l’application.

Pour les tests dev, Codex peut temporairement utiliser :

```bash id="v2h3oc"
pnpm exec docmd dev
pnpm exec docmd build
```

Mais le code de l’application doit appeler `@docmd/core` ou un binaire local contrôlé.

---

# 6. Architecture à créer

Créer un module dédié.

```txt id="qvk7e4"
src/main/elephantnote/sitePreview/
  siteTypes.ts
  pathSafety.ts
  DocmdConfigWriter.ts
  DocmdSiteManager.ts
  StaticSiteServer.ts
  SitePreviewService.ts
  sitePreviewIpc.ts

src/renderer/elephantnote/sitePreview/
  SitePreviewPanel.vue
  SitePreviewToolbar.vue
  sitePreviewStore.ts
```

Règle :

```txt id="xoeqxe"
Renderer Vue → IPC → Electron main → docmd / filesystem / server local
```

Le renderer ne doit jamais appeler directement :

```txt id="cfcbwk"
fs
path
child_process
@docmd/core
```

---

# 7. Types à créer

Créer `siteTypes.ts`.

```ts id="dl536o"
export type SitePreviewStatus =
  | 'idle'
  | 'preparing'
  | 'building'
  | 'serving'
  | 'ready'
  | 'error'
  | 'stopped'

export type SiteBuildMode = 'preview' | 'static-export'

export type SitePreviewRequest = {
  vaultRoot: string
  folderPath: string
  mode: SiteBuildMode
}

export type SitePreviewInfo = {
  id: string
  vaultRoot: string
  sourceFolder: string
  configPath: string
  outputDir: string
  tmpDir: string
  port?: number
  url?: string
  status: SitePreviewStatus
  error?: string
}
```

Vérification :

```bash id="n98yu9"
pnpm typecheck
```

---

# 8. Sécurité des chemins

Créer ou réutiliser `pathSafety.ts`.

Fonctions :

```ts id="kqh2oi"
export function assertPathInsideVault(vaultRoot: string, targetPath: string): void

export function isIgnoredForSite(relativePath: string): boolean

export function isValidSiteSourceFolder(vaultRoot: string, folderPath: string): boolean
```

Dossiers interdits :

```txt id="g7jw6j"
.elephantnote
.git
node_modules
dist
build
.cache
```

Extensions autorisées dans le site :

```txt id="vnr144"
.md
.markdown
.png
.jpg
.jpeg
.webp
.gif
.svg
.css
.js
.json
```

Interdit :

```txt id="hovicr"
fichier hors vault
chemin avec ../
dossier .elephantnote
dossier .git
node_modules
```

Vérifications obligatoires :

```txt id="y6eypx"
un dossier normal est accepté
../outside est rejeté
.elephantnote est rejeté
.git est rejeté
node_modules est rejeté
un fichier hors vault est rejeté
```

---

# 9. Génération de config docmd

Créer `DocmdConfigWriter.ts`.

Responsabilité :

```txt id="ja09al"
écrire un docmd.config.json temporaire pour un dossier donné
```

Config minimale :

```json id="os433o"
{
  "title": "ElephantNote",
  "src": "SOURCE_FOLDER_RELATIVE_OR_ABSOLUTE",
  "out": "site",
  "tmp": "tmp",
  "base": "/",
  "theme": {
    "name": "default"
  },
  "layout": {
    "optionsMenu": {
      "position": "header",
      "components": {
        "search": true
      }
    }
  },
  "minify": false,
  "autoTitleFromH1": true,
  "copyCode": true,
  "pageNavigation": true
}
```

`docmd.config.json` est le fichier standard de configuration recommandé depuis docmd v0.8, avec des clés comme `title`, `src`, `out`, `tmp`, `base`, `plugins`, `engine`. ([Docmd][3])

## Point important

Codex doit vérifier comment `docmd` résout `src` :

```txt id="w7achb"
src relatif au cwd ?
src relatif au docmd.config.json ?
src absolu accepté ?
```

Il doit faire un test avant d’intégrer.

Test à créer :

```txt id="mp7vf3"
create temp folder
create docs/index.md
create docmd.config.json
run docmd build
verify site/index.html exists
```

Si `src` absolu fonctionne, utiliser :

```json id="l1jgae"
{
  "src": "/absolute/path/to/folder"
}
```

Sinon, utiliser un dossier de staging.

---

# 10. Stratégie de staging

Pour éviter que `docmd` modifie ou pollue les notes originales, ElephantNote doit créer un dossier de preview dans `.elephantnote`.

Option recommandée V1 :

```txt id="k41mum"
ne pas copier tout le dossier
écrire seulement docmd.config.json
mettre out et tmp dans .elephantnote/site-previews/<id>/
pointer src vers le dossier original
```

Si `docmd` ne supporte pas correctement `src` absolu, fallback :

```txt id="iro0qc"
copier temporairement les fichiers nécessaires dans:
.elephantnote/site-previews/<id>/source/
```

Mais ce fallback doit rester une deuxième option, pas le comportement principal.

---

# 11. DocmdSiteManager

Créer `DocmdSiteManager.ts`.

Responsabilité :

```txt id="rk5aez"
préparer la config
lancer un build docmd
nettoyer les anciens builds
retourner le dossier de sortie
```

Interface :

```ts id="vmkx8t"
export class DocmdSiteManager {
  async preparePreview(request: SitePreviewRequest): Promise<SitePreviewInfo>

  async buildStaticSite(request: SitePreviewRequest): Promise<SitePreviewInfo>

  async cleanPreview(siteId: string): Promise<void>

  async cleanAllPreviews(vaultRoot: string): Promise<void>
}
```

## Build avec Node API

Utiliser de préférence l’API Node si elle fonctionne dans Electron :

```ts id="i5f7de"
import { buildSite } from '@docmd/core'
```

La doc Node API indique que `buildSite(configPath, options)` charge la config, parse le Markdown et génère les assets. ([Docmd][4])

Pseudo-code :

```ts id="4kpcrg"
await buildSite(configPath, {
  isDev: false,
  offline: false,
  zeroConfig: false
})
```

Si l’API Node pose problème dans Electron, fallback autorisé :

```ts id="z88q5o"
spawn local docmd binary with execFile
```

Mais interdit :

```txt id="ylui15"
npx qui télécharge depuis Internet
commande shell non contrôlée
string command avec interpolation dangereuse
```

Utiliser `execFile`, pas `exec`.

---

# 12. StaticSiteServer

Créer `StaticSiteServer.ts`.

Responsabilité :

```txt id="uppz9x"
servir localement le dossier site/ généré
```

Ne pas utiliser un serveur externe.

Créer un petit serveur HTTP local avec Node :

```ts id="siof3p"
import http from 'node:http'
```

Règles :

```txt id="xxb5ct"
bind uniquement sur 127.0.0.1
port dynamique libre
servir uniquement outputDir
bloquer path traversal
servir index.html pour les routes SPA si nécessaire
stopper le serveur quand la preview est fermée
```

Interface :

```ts id="m9mwbl"
export class StaticSiteServer {
  async start(outputDir: string): Promise<{ port: number; url: string }>

  async stop(): Promise<void>
}
```

URL :

```txt id="wgubqi"
http://127.0.0.1:<port>/
```

Vérifications :

```txt id="w5s9fk"
le serveur ne bind pas 0.0.0.0
un fichier hors outputDir est inaccessible
index.html est servi
un asset image est servi
```

---

# 13. SitePreviewService

Créer `SitePreviewService.ts`.

Responsabilité :

```txt id="qe364m"
orchestrer tout
```

Interface :

```ts id="qym9b9"
export class SitePreviewService {
  async previewFolder(params: {
    vaultRoot: string
    folderPath: string
  }): Promise<SitePreviewInfo>

  async buildFolder(params: {
    vaultRoot: string
    folderPath: string
  }): Promise<SitePreviewInfo>

  async stopPreview(siteId: string): Promise<void>

  async getStatus(siteId: string): Promise<SitePreviewInfo | null>
}
```

Flux `previewFolder` :

```txt id="pzgygd"
1. vérifier chemin
2. vérifier dossier source
3. créer siteId stable
4. créer .elephantnote/site-previews/<siteId>
5. écrire docmd.config.json
6. lancer build docmd
7. lancer StaticSiteServer
8. retourner URL locale
```

Flux `buildFolder` :

```txt id="j8k8r1"
1. vérifier chemin
2. créer .elephantnote/site-builds/<siteId>
3. écrire config
4. lancer docmd build
5. retourner outputDir
```

---

# 14. IPC

Créer `sitePreviewIpc.ts`.

Channels :

```txt id="zp7pda"
en:site-preview:preview-folder
en:site-preview:build-folder
en:site-preview:stop
en:site-preview:status
en:site-preview:open-external
```

Preload :

```ts id="d3ykcg"
window.elephantnote.sitePreview = {
  previewFolder: (params) =>
    ipcRenderer.invoke('en:site-preview:preview-folder', params),

  buildFolder: (params) =>
    ipcRenderer.invoke('en:site-preview:build-folder', params),

  stop: (siteId) =>
    ipcRenderer.invoke('en:site-preview:stop', siteId),

  status: (siteId) =>
    ipcRenderer.invoke('en:site-preview:status', siteId),

  openExternal: (url) =>
    ipcRenderer.invoke('en:site-preview:open-external', url)
}
```

Validation IPC :

```txt id="ipgpv2"
vaultRoot doit être une vault connue
folderPath doit être dans la vault
folderPath doit être un dossier
siteId doit être connu
url doit commencer par http://127.0.0.1:
```

---

# 15. UI — menu dossier

Dans les cartes dossier et la sidebar, ajouter :

```txt id="whcx5w"
View as website
Build static website
```

Ne pas afficher ces options sur une note simple.

Les afficher uniquement sur :

```txt id="wln81r"
folder
category liée à un folder
```

Comportement :

```txt id="dtnnum"
clic View as website
  ↓
status preparing
  ↓
status building
  ↓
site ready
  ↓
ouvrir SitePreviewPanel
```

---

# 16. UI — SitePreviewPanel

Créer `SitePreviewPanel.vue`.

Layout :

```txt id="svegr0"
┌─────────────────────────────────────────────┐
│ Research / AI                               │
│ [Refresh] [Open in browser] [Build static]  │
├─────────────────────────────────────────────┤
│ Local website preview                       │
└─────────────────────────────────────────────┘
```

V1 simple :

```txt id="y5kmgn"
ouvrir dans le navigateur externe
afficher dans ElephantNote un panneau avec l’URL locale
```

V1.1 :

```txt id="r7f9f8"
afficher dans l’app avec une WebContentsView ou BrowserView sandboxée
```

Éviter une intégration sale avec un iframe si possible.

Sécurité preview in-app :

```txt id="lfdeg1"
nodeIntegration: false
contextIsolation: true
sandbox: true
allowRunningInsecureContent: false
```

---

# 17. Build statique exportable

Quand l’utilisateur clique `Build static website` :

```txt id="a1x2v5"
générer le site dans .elephantnote/site-builds/<siteId>/site
afficher un bouton Open folder
afficher un bouton Open in browser
```

Plus tard, on pourra ajouter :

```txt id="m6r1ph"
Choose export folder
Zip website
Deploy
```

Mais pas maintenant.

---

# 18. Gestion des assets

Les images relatives doivent continuer à marcher.

Exemple Markdown :

```md id="l62x3p"
# Architecture

![Schema](./assets/schema.png)
```

Le site généré doit afficher l’image.

Codex doit tester :

```txt id="qgd4i9"
image relative dans même dossier
image dans sous-dossier assets/
lien relatif vers une autre note
```

Liens attendus :

```md id="2i0fq6"
[Embeddings](./embeddings.md)
```

Doit mener vers la page correspondante dans le site.

---

# 19. Frontmatter supporté

ElephantNote doit laisser l’utilisateur écrire du frontmatter compatible docmd.

Exemple :

```md id="eyhb04"
---
title: "World Model"
description: "Notes sur les modèles du monde et la mémoire."
noindex: false
---

# World Model
```

Règles :

```txt id="buyv5f"
ne pas forcer le frontmatter
ne pas ajouter automatiquement du frontmatter partout
ne pas casser les notes existantes
```

Si une note n’a pas de frontmatter, docmd doit utiliser le Markdown tel quel.

---

# 20. Search dans le site généré

Ne pas coder la recherche du site.

Docmd a déjà un plugin de recherche client-side : il indexe les pages au build, extrait titres/headings/prose, génère un `search-index.json`, puis la recherche se fait localement dans le navigateur. ([Docmd][5])

Donc Codex ne doit pas créer une seconde recherche pour cette feature.

À faire :

```txt id="x85brp"
activer la recherche docmd dans la config si nécessaire
vérifier que Ctrl+K dans le site ouvre bien la recherche docmd
```

---

# 21. LLM files

Docmd sait générer des fichiers comme `llms.txt` et `llms-full.txt` pour rendre la documentation plus exploitable par des modèles IA. ([Docmd][6])

Pour ElephantNote V1 :

```txt id="g5989m"
laisser le comportement docmd par défaut
ne pas ajouter de feature IA
ne pas appeler de LLM
ne pas envoyer les notes ailleurs
```

Plus tard, ElephantNote pourra utiliser ces fichiers localement.

---

# 22. Gestion des erreurs

Cas à gérer :

```txt id="mt4m79"
dossier vide
aucun fichier Markdown
fichier Markdown invalide
image manquante
permission refusée
docmd build failed
port déjà utilisé
preview déjà ouverte
vault déplacée
```

Messages propres :

```txt id="czg114"
This folder does not contain Markdown notes.
Website preview failed. See logs for details.
The selected folder is outside the active vault.
The local preview server could not start.
```

Logs :

```txt id="d9a0rl"
<VaultRoot>/.elephantnote/site-previews/<siteId>/logs/site-preview.log
```

Ne jamais crasher l’app.

---

# 23. Nettoyage

Ajouter une commande interne :

```txt id="83cqkk"
Clean old website previews
```

Règles :

```txt id="k7jv6w"
supprimer les previews plus anciennes que 7 jours
ne jamais supprimer site-builds sans demande utilisateur
ne jamais supprimer les notes
ne jamais supprimer workspace.json
```

Au démarrage d’ElephantNote :

```txt id="sxaa7o"
optionnellement nettoyer les anciennes previews arrêtées
```

---

# 24. Tests obligatoires

## 24.1 Tests sécurité

```txt id="knmx1w"
reject folder outside vault
reject ../ path
reject .elephantnote
reject .git
reject node_modules
server cannot serve file outside outputDir
```

## 24.2 Tests config

```txt id="jko9l3"
writes docmd.config.json
config contains correct title
config points to selected source folder
config output is inside .elephantnote
config tmp is inside .elephantnote
```

## 24.3 Tests build

Créer une vault de test :

```txt id="kejz80"
Vault/
  Docs/
    index.md
    guide.md
    assets/
      schema.png
```

Puis vérifier :

```txt id="hn42y8"
docmd build succeeds
site/index.html exists
guide page exists
asset is copied or reachable
search-index exists if docmd generates it
```

## 24.4 Tests serveur

```txt id="jv5u0k"
server starts on 127.0.0.1
index.html is served
asset is served
path traversal blocked
server stops correctly
```

## 24.5 Tests UI

```txt id="povg55"
menu folder shows View as website
menu note does not show View as website
click opens preview
Open in browser works
Build static website works
```

---

# 25. Ordre exact de développement

Codex doit suivre cet ordre.

```txt id="v66sul"
1. Installer @docmd/core
2. Créer siteTypes.ts
3. Créer pathSafety.ts ou réutiliser celui de search
4. Ajouter tests pathSafety
5. Créer DocmdConfigWriter.ts
6. Tester génération docmd.config.json
7. Créer un test minimal docmd build sur dossier temporaire
8. Créer DocmdSiteManager.ts
9. Créer StaticSiteServer.ts
10. Tester serveur local
11. Créer SitePreviewService.ts
12. Créer IPC main/preload
13. Ajouter menu View as website sur dossiers
14. Ajouter menu Build static website sur dossiers
15. Ajouter SitePreviewPanel.vue
16. Brancher Open in browser
17. Ajouter logs et erreurs propres
18. Ajouter nettoyage des previews
19. Tester sur une vraie vault ElephantNote
20. Documenter la feature
```

Ne pas commencer par l’UI.
Commencer par un test de build docmd isolé.

---

# 26. Prompt principal à donner à Codex

```txt id="s6bqf9"
Implement ElephantNote folder-to-website preview using docmd.

Use the existing MIT-licensed project docmd.
Do not build a custom documentation website generator.
Do not build a custom Markdown website renderer.
Do not build a custom website search system.

Dependency:
- @docmd/core

Feature:
When the user selects a folder of Markdown notes, ElephantNote can generate and display a local website for that folder.

Strict rules:
- local only
- no API key
- no cloud provider
- no upload
- no external documentation service
- no changes to original Markdown files
- no filesystem access from renderer
- all filesystem/docmd/server work must happen in Electron main process through IPC
- validate all paths are inside the active vault
- ignore .elephantnote, .git, node_modules, dist, build, cache folders

Storage:
Use:
<VaultRoot>/.elephantnote/site-previews/<siteId>/
for previews.

Use:
<VaultRoot>/.elephantnote/site-builds/<siteId>/
for static builds.

Required main-process files:
src/main/elephantnote/sitePreview/siteTypes.ts
src/main/elephantnote/sitePreview/pathSafety.ts
src/main/elephantnote/sitePreview/DocmdConfigWriter.ts
src/main/elephantnote/sitePreview/DocmdSiteManager.ts
src/main/elephantnote/sitePreview/StaticSiteServer.ts
src/main/elephantnote/sitePreview/SitePreviewService.ts
src/main/elephantnote/sitePreview/sitePreviewIpc.ts

Required renderer files:
src/renderer/elephantnote/sitePreview/sitePreviewStore.ts
src/renderer/elephantnote/sitePreview/SitePreviewPanel.vue
src/renderer/elephantnote/sitePreview/SitePreviewToolbar.vue

Behavior:
- Add "View as website" to folder context menu.
- Add "Build static website" to folder context menu.
- Do not show these actions on normal notes.
- View as website prepares a docmd config for the selected folder.
- It builds or serves the folder locally.
- It starts a local server bound only to 127.0.0.1.
- It returns a localhost URL.
- ElephantNote displays the URL and allows opening it in the external browser.
- Later, an in-app sandboxed BrowserView/WebContentsView preview can be added.
- Build static website generates a static site in .elephantnote/site-builds/<siteId>/site.

Docmd integration:
- Prefer importing @docmd/core and using the Node API if it works.
- If Node API is not compatible in Electron, use execFile with the local docmd binary.
- Do not use npx.
- Do not use shell exec with interpolated paths.
- Do not download packages at runtime.

Config:
Generate a docmd.config.json for each preview/build.
The config must set:
- title
- src
- out
- tmp
- base
- search enabled if supported by layout config
- autoTitleFromH1 enabled
- copyCode enabled
- pageNavigation enabled

Tests:
- path outside vault rejected
- .elephantnote ignored
- .git ignored
- node_modules ignored
- docmd.config.json generated correctly
- docmd build succeeds on temp docs folder
- local server serves index.html
- local server blocks path traversal
- folder menu shows View as website
- note menu does not show View as website
- build static website does not modify original notes

Acceptance:
- A folder containing Markdown notes can be displayed as a local website.
- The generated website has navigation.
- Relative links between Markdown files work.
- Relative images work.
- Search works if docmd search is available.
- The original notes are not modified.
- No data leaves the machine.
- No API key is required.
- Preview files are stored only under .elephantnote/site-previews.
- Static builds are stored only under .elephantnote/site-builds.
```

---

# 27. Prompt étape par étape

Donne-lui d’abord uniquement ça :

```txt id="q2eyyy"
Start only with steps 1 to 7.

Goal:
Prove that ElephantNote can generate a docmd static site from a temporary Markdown folder.

Do not touch the UI.
Do not add menu items.
Do not add BrowserView.
Do not add live preview.
Do not refactor unrelated MarkText code.

Tasks:
1. Install @docmd/core.
2. Create siteTypes.ts.
3. Create pathSafety.ts.
4. Add pathSafety tests.
5. Create DocmdConfigWriter.ts.
6. Add tests for docmd.config.json generation.
7. Add one integration test that creates a temp docs folder with index.md and guide.md, runs docmd build, and verifies site/index.html exists.

After implementation:
- run typecheck
- run related tests
- list changed files
- explain how to verify manually
```

Puis seulement après validation :

```txt id="ucvfwc"
Now implement steps 8 to 12 only.

Goal:
Build the backend preview service.

Tasks:
1. Create DocmdSiteManager.
2. Create StaticSiteServer.
3. Create SitePreviewService.
4. Create sitePreviewIpc.
5. Expose preload API.

Do not implement UI yet.
Do not use npx.
Do not use remote services.
Do not access filesystem from renderer.

Acceptance:
- IPC can build a site from a known folder.
- IPC can start a localhost preview server.
- IPC can stop the preview server.
- Path traversal is blocked.
```

Puis :

```txt id="c4h72y"
Now implement the UI integration only.

Tasks:
1. Add "View as website" to folder menus.
2. Add "Build static website" to folder menus.
3. Do not show these actions for notes.
4. Create SitePreviewPanel.
5. Add Open in browser button.
6. Display build/preview errors cleanly.

Do not change the editor.
Do not change the search system.
Do not add publishing.
```

---

Pour cette feature, la bonne stratégie est vraiment : **docmd fait le site, ElephantNote fait seulement l’intégration locale propre**. Codex ne doit pas coder “un mini VitePress maison”, sinon il va perdre du temps et casser l’app.

[1]: https://github.com/docmd-io/docmd?utm_source=chatgpt.com "docmd-io/docmd: Build production-ready documentation ..."
[2]: https://docs.docmd.io/api/cli-commands/ "
      CLI Commands : docmd docs
    "
[3]: https://docs.docmd.io/configuration/overview/ "
      General Configuration : docmd docs
    "
[4]: https://docs.docmd.io/api/node-api/ "
      Node.js API : docmd docs
    "
[5]: https://docs.docmd.io/plugins/search/ "
      Search Plugin : docmd docs
    "
[6]: https://docs.docmd.io/ "
      docmd docs: deploy production-ready docs from Markdown
    "

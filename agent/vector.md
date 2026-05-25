Voici une version complète, propre, découpée en étapes, avec des vérifications à chaque phase. Tu peux donner ça directement à Codex.

---

# ElephantNote — Spécification complète étape par étape

## Recherche locale sémantique avec Vectra, sans clé API

## 0. Objectif général

Implémenter dans ElephantNote une recherche intelligente locale basée sur des embeddings.

La fonctionnalité doit permettre :

* de chercher dans toutes les notes Markdown d’une vault ;
* de retrouver des notes proches sémantiquement, même sans les mêmes mots exacts ;
* de garder un index caché local ;
* de préparer plus tard des fonctions comme `related notes`, graphe de pensée, RAG local, synthèse de notes ;
* de ne jamais utiliser de clé API ;
* de ne jamais envoyer les notes sur Internet.

Le backend de recherche doit utiliser un projet existant MIT pour éviter de coder une base vectorielle maison.

Dépendances choisies :

```bash
pnpm add vectra @huggingface/transformers
```

Backend :

```txt
Vectra
```

Modèle d’embedding local par défaut :

```txt
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Ce modèle est choisi parce que les notes peuvent être en français et en anglais.

---

# 1. Règles strictes à respecter

## 1.1 Interdictions absolues

Ne jamais utiliser :

```txt
OpenAI API
OpenAIEmbeddings
Anthropic API
Google API
Cohere API
Voyage API
Pinecone
Qdrant Cloud
Weaviate Cloud
Supabase vector search
Remote embedding provider
Remote LLM provider
API key
```

Ne jamais :

```txt
envoyer le contenu des notes à un serveur
stocker les embeddings dans les fichiers Markdown
bloquer l’interface pendant l’indexation
coder une base vectorielle maison
coder une recherche cosine maison si Vectra le fait déjà
coder un système complet de chunking si Vectra le gère déjà
accéder au filesystem depuis le renderer
indexer .elephantnote
indexer .git
indexer node_modules
```

## 1.2 Règle de vie privée

Les notes de l’utilisateur doivent rester locales.

La recherche doit fonctionner comme ceci :

```txt
notes Markdown locales
      ↓
modèle d’embedding local
      ↓
index Vectra local
      ↓
recherche locale
```

Aucun contenu utilisateur ne doit sortir de la machine.

## 1.3 Règle sur le modèle

Le modèle peut être téléchargé une fois s’il n’est pas disponible localement.

Mais :

```txt
pas de clé API
pas d’upload des notes
cache local obligatoire
mode offline possible après téléchargement
```

---

# 2. Architecture globale

La recherche doit être intégrée dans Electron de cette manière :

```txt
Renderer Vue UI
    ↓ IPC preload
Electron main process
    ↓
ElephantSearchService
    ↓
Vectra LocalDocumentIndex
    ↓
Index local sur disque
```

Le renderer ne doit jamais manipuler directement :

```txt
fs
path
Vectra
embeddings
fichiers d’index
```

Tout passe par IPC.

---

# 3. Emplacement des fichiers

Dans chaque vault ElephantNote :

```txt
<VaultRoot>/
  .elephantnote/
    workspace.json
    search/
      vectra/
        ...
      models/
        ...
      search-state.json
      logs/
        search.log
```

## 3.1 Index Vectra

```txt
<VaultRoot>/.elephantnote/search/vectra/
```

## 3.2 Cache modèle

Deux options acceptées :

Option A, par vault :

```txt
<VaultRoot>/.elephantnote/search/models/
```

Option B, global app :

```txt
<AppData>/ElephantNote/models/
```

Pour la V1, utiliser l’option la plus simple à intégrer proprement.

## 3.3 Source de vérité

Les fichiers Markdown restent la source de vérité.

L’index est un cache reconstruisible.

Donc si l’index est supprimé :

```txt
les notes restent intactes
l’index peut être reconstruit
aucune donnée utilisateur importante n’est perdue
```

---

# 4. Structure des fichiers à créer

Créer ces fichiers côté main process :

```txt
src/main/elephantnote/search/
  ElephantSearchService.ts
  VectraIndexManager.ts
  VaultSearchWatcher.ts
  markdownToSearchText.ts
  searchIpc.ts
  searchTypes.ts
  pathSafety.ts
```

Créer ces fichiers côté renderer :

```txt
src/renderer/elephantnote/search/
  SearchModal.vue
  SearchResultItem.vue
  SearchStatusBadge.vue
  searchStore.ts
```

Créer ou modifier le preload :

```txt
src/preload/elephantnoteSearch.ts
```

Ou intégrer proprement dans le preload déjà existant.

---

# 5. Types communs

Créer `searchTypes.ts`.

```ts
export type SearchStatus =
  | 'disabled'
  | 'not_initialized'
  | 'model_missing'
  | 'model_loading'
  | 'indexing'
  | 'ready'
  | 'error'

export type SearchMode = 'smart' | 'exact' | 'semantic'

export type SearchResult = {
  id: string
  uri: string
  title: string
  relativePath: string
  score: number
  matchType: 'semantic' | 'keyword' | 'hybrid'
  snippets: SearchSnippet[]
}

export type SearchSnippet = {
  text: string
  score?: number
  isKeywordMatch?: boolean
}

export type SearchIndexStatus = {
  status: SearchStatus
  vaultPath?: string
  indexedDocuments: number
  totalDocuments: number
  message?: string
  error?: string
}
```

## Vérification étape 5

Après cette étape :

* le projet compile ;
* aucun comportement n’a encore changé ;
* aucun accès réseau n’a été ajouté ;
* aucun appel API externe n’existe.

Commande :

```bash
pnpm lint
pnpm typecheck
```

---

# 6. Sécurité des chemins

Créer `pathSafety.ts`.

Objectif :

* empêcher d’indexer un fichier hors vault ;
* empêcher les chemins `../` ;
* ignorer les dossiers interdits ;
* ne jamais indexer `.elephantnote`.

Fonctions attendues :

```ts
export function assertPathInsideVault(vaultRoot: string, targetPath: string): void

export function isIgnoredPath(relativePath: string): boolean

export function isMarkdownFile(filePath: string): boolean
```

Règles :

```txt
autorisé :
Notes/test.md
Research/AI/world-model.md

interdit :
../outside.md
.elephantnote/search/index.json
.git/config
node_modules/package/index.md
```

Extensions V1 :

```txt
.md
.markdown
```

Dossiers ignorés :

```txt
.elephantnote
.git
node_modules
dist
build
.cache
```

## Vérification étape 6

Créer des tests unitaires :

```txt
path inside vault accepted
path outside vault rejected
../ path rejected
.elephantnote ignored
.git ignored
node_modules ignored
.md accepted
.pdf ignored in V1
```

Commandes :

```bash
pnpm test pathSafety
pnpm typecheck
```

Ne pas continuer tant que ces tests ne passent pas.

---

# 7. Nettoyage Markdown pour l’indexation

Créer `markdownToSearchText.ts`.

Cette fonction transforme un fichier Markdown en texte propre pour la recherche.

Elle ne doit pas modifier le fichier original.

Signature :

```ts
export function markdownToSearchText(markdown: string): string
```

Elle doit :

```txt
garder les titres
garder les paragraphes
garder les listes
garder le texte des liens
garder le alt text des images
garder les blocs de code raisonnables
retirer les délimiteurs frontmatter
réduire le bruit Markdown
normaliser les espaces
```

Exemple entrée :

```md
---
title: "World Model"
tags: ["ai", "memory"]
---

# World Model

![schema mémoire](./schema.png)

This note explains latent memory and semantic retrieval.

[Link to paper](https://example.com)
```

Sortie attendue approximative :

```txt
World Model
Tags: ai, memory

World Model

schema mémoire

This note explains latent memory and semantic retrieval.

Link to paper
```

Ne pas faire un parser Markdown complexe maison.
La fonction doit rester simple, robuste et testable.

## Vérification étape 7

Tests :

```txt
frontmatter is converted into useful text
headings are kept
paragraphs are kept
image alt text is kept
link text is kept
markdown syntax noise is reduced
empty markdown returns empty string
```

Commandes :

```bash
pnpm test markdownToSearchText
pnpm typecheck
```

---

# 8. VectraIndexManager

Créer `VectraIndexManager.ts`.

Responsabilité :

```txt
initialiser Vectra
créer l’index si absent
charger le modèle local
faire upsert/delete/query
masquer les détails de Vectra au reste de l’app
```

Le reste de l’application ne doit pas appeler Vectra directement.

Interface attendue :

```ts
export class VectraIndexManager {
  async init(vaultRoot: string): Promise<void>

  async isReady(): Promise<boolean>

  async upsertMarkdownFile(params: {
    vaultRoot: string
    absolutePath: string
  }): Promise<void>

  async deleteMarkdownFile(params: {
    vaultRoot: string
    absolutePath: string
  }): Promise<void>

  async query(params: {
    query: string
    mode: 'smart' | 'exact' | 'semantic'
    limit?: number
  }): Promise<SearchResult[]>

  async rebuild(vaultRoot: string): Promise<void>

  async clear(vaultRoot: string): Promise<void>
}
```

## 8.1 Configuration locale

Créer une config interne :

```ts
const DEFAULT_SEARCH_CONFIG = {
  backend: 'vectra',
  embeddingProvider: 'transformers-local',
  model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  allowRemoteProviders: false,
  requireApiKey: false,
  uploadNotes: false,
  indexFolderName: '.elephantnote/search/vectra'
}
```

## 8.2 Utilisation obligatoire

Utiliser :

```txt
Vectra LocalDocumentIndex
Transformers.js embeddings locales
```

Ne pas utiliser :

```txt
OpenAIEmbeddings
remote provider
API key
```

## 8.3 Document URI

Chaque note doit avoir une URI stable.

Format recommandé :

```txt
elephantnote://vault/<encoded-relative-path>
```

Exemple :

```txt
elephantnote://vault/Research/AI/world-model.md
```

L’URI doit permettre de retrouver le chemin relatif.

## 8.4 Upsert note

Flux :

```txt
vérifier chemin
ignorer si pas Markdown
ignorer si dossier interdit
lire fichier
markdownToSearchText
upsert dans Vectra
```

Pseudo-code :

```ts
async upsertMarkdownFile({ vaultRoot, absolutePath }) {
  assertPathInsideVault(vaultRoot, absolutePath)

  const relativePath = path.relative(vaultRoot, absolutePath)

  if (isIgnoredPath(relativePath)) return
  if (!isMarkdownFile(absolutePath)) return

  const markdown = await fs.readFile(absolutePath, 'utf8')
  const text = markdownToSearchText(markdown)
  const uri = toElephantNoteUri(relativePath)

  await this.index.upsertDocument(uri, text, 'md')
}
```

Adapter les appels exacts à l’API réelle de Vectra installée.

## 8.5 Query

La recherche doit accepter 3 modes.

### Smart

Mode par défaut.

```txt
hybride sémantique + keyword si Vectra le permet
```

### Semantic

Recherche par embeddings.

### Exact

Recherche texte.
Si Vectra ne permet pas une recherche exacte séparée simplement, laisser `Exact` comme fallback basique temporaire, mais ne pas coder un moteur complet.

## Vérification étape 8

Tests ou vérification manuelle :

```txt
init creates index folder
init does not ask for API key
init does not call OpenAI
upsert indexes a markdown file
query returns result for indexed file
delete removes file from results
clear removes local index only
```

Vérifier dans le code :

```txt
aucun import OpenAI
aucun process.env.OPENAI_API_KEY
aucun champ apiKey
aucun fetch vers un provider cloud
```

Commandes :

```bash
pnpm typecheck
pnpm test VectraIndexManager
```

---

# 9. ElephantSearchService

Créer `ElephantSearchService.ts`.

Responsabilité :

```txt
service public côté main process
gère la vault active
gère le statut
appelle VectraIndexManager
coordonne indexation et recherche
```

Interface :

```ts
export class ElephantSearchService {
  async initForVault(vaultRoot: string): Promise<SearchIndexStatus>

  async search(params: {
    query: string
    mode?: SearchMode
    limit?: number
  }): Promise<SearchResult[]>

  async indexFile(absolutePath: string): Promise<void>

  async deleteFile(absolutePath: string): Promise<void>

  async rebuildIndex(): Promise<SearchIndexStatus>

  async clearIndex(): Promise<SearchIndexStatus>

  async getStatus(): Promise<SearchIndexStatus>
}
```

Règles :

```txt
si aucune vault active → status not_initialized
si modèle en chargement → status model_loading
si indexation en cours → status indexing
si prêt → status ready
si erreur → status error
```

La recherche doit être robuste :

```txt
query vide → []
index pas prêt → []
erreur modèle → fallback exact si possible
erreur Vectra → message propre, pas crash
```

## Vérification étape 9

Tests :

```txt
service returns not_initialized before vault init
service initializes vault
service searches after index
empty query returns []
error does not crash process
```

Commandes :

```bash
pnpm test ElephantSearchService
pnpm typecheck
```

---

# 10. Indexation initiale d’une vault

Ajouter une méthode pour scanner les notes Markdown d’une vault.

Fonction attendue :

```ts
async indexVault(vaultRoot: string): Promise<void>
```

Flux :

```txt
lister récursivement les fichiers
ignorer dossiers interdits
garder uniquement .md/.markdown
upsert chaque note dans Vectra
mettre à jour le statut de progression
ne pas bloquer l’UI
```

Règles de performance :

```txt
ne pas indexer plus d’un fichier à la fois au début
mettre une progression
catch erreur par fichier
continuer si une note est illisible
```

Statut :

```ts
{
  status: 'indexing',
  indexedDocuments: 42,
  totalDocuments: 120,
  message: 'Indexing notes...'
}
```

## Vérification étape 10

Créer une vault de test :

```txt
TestVault/
  note-a.md
  note-b.md
  Research/note-c.md
  .elephantnote/private.md
  node_modules/ignored.md
```

Résultat attendu :

```txt
note-a.md indexée
note-b.md indexée
Research/note-c.md indexée
.elephantnote/private.md ignorée
node_modules/ignored.md ignorée
```

Commandes :

```bash
pnpm test indexVault
pnpm typecheck
```

---

# 11. Watcher de fichiers

Créer `VaultSearchWatcher.ts`.

Responsabilité :

```txt
surveiller la vault
détecter création/modification/suppression de notes
déclencher indexation incrémentale
```

Utiliser si possible :

```txt
Vectra FolderWatcher
```

Sinon, utiliser le watcher déjà présent dans MarkText ou `chokidar`, mais garder la logique minimale.

Règles :

```txt
debounce 1000 à 2000 ms
ignorer .elephantnote
ignorer .git
ignorer node_modules
indexer seulement .md/.markdown
ne pas bloquer l’éditeur
ne pas déclencher 10 indexations pendant une sauvegarde
```

Flux :

```txt
file created → upsertMarkdownFile
file changed → debounce → upsertMarkdownFile
file deleted → deleteMarkdownFile
```

## Vérification étape 11

Tests/manuels :

```txt
créer une note → apparaît dans la recherche
modifier une note → résultat mis à jour
supprimer une note → disparaît de la recherche
modifier workspace.json → pas indexé
modifier fichier dans .elephantnote → pas indexé
```

Commandes :

```bash
pnpm typecheck
pnpm test VaultSearchWatcher
```

---

# 12. IPC main/preload

Créer `searchIpc.ts`.

Channels :

```txt
en:search:init-vault
en:search:query
en:search:status
en:search:rebuild
en:search:clear
en:search:disable
en:search:enable
```

Côté preload, exposer :

```ts
window.elephantnote.search = {
  initVault: (vaultPath: string) =>
    ipcRenderer.invoke('en:search:init-vault', vaultPath),

  query: (params: {
    query: string
    mode?: 'smart' | 'exact' | 'semantic'
    limit?: number
  }) => ipcRenderer.invoke('en:search:query', params),

  status: () =>
    ipcRenderer.invoke('en:search:status'),

  rebuild: () =>
    ipcRenderer.invoke('en:search:rebuild'),

  clear: () =>
    ipcRenderer.invoke('en:search:clear'),

  disable: () =>
    ipcRenderer.invoke('en:search:disable'),

  enable: () =>
    ipcRenderer.invoke('en:search:enable')
}
```

Validation obligatoire côté IPC :

```txt
query doit être string
mode doit être smart/exact/semantic
limit doit être borné entre 1 et 50
vaultPath doit être une vault connue
```

## Vérification étape 12

Tests :

```txt
renderer can call status
renderer can query
invalid mode rejected
huge limit clamped
unknown vault rejected
```

Commandes :

```bash
pnpm test searchIpc
pnpm typecheck
```

---

# 13. Intégration au chargement d’une vault

Quand une vault est ouverte :

```txt
charger workspace.json
initialiser UI
initialiser ElephantSearchService
lancer indexation en arrière-plan
lancer watcher
```

Important :

```txt
l’UI ne doit pas attendre la fin de l’indexation
l’éditeur doit être utilisable immédiatement
la recherche affiche son statut si l’index n’est pas prêt
```

Flux :

```txt
user opens vault
  ↓
vault UI appears
  ↓
search service starts in background
  ↓
search status = model_loading or indexing
  ↓
search status = ready
```

## Vérification étape 13

Manuel :

```txt
ouvrir une vault vide
ouvrir une vault avec 100 notes
vérifier que l’interface reste responsive
vérifier que le statut évolue
vérifier que la recherche marche après indexation
```

---

# 14. UI — SearchBox

Dans la topbar existante, la barre de recherche doit ouvrir une modale.

Comportement :

```txt
clic sur SearchBox → ouvre SearchModal
Ctrl+K → ouvre SearchModal
Cmd+K sur macOS → ouvre SearchModal
```

La SearchBox de la topbar peut rester visuellement simple.

Placeholder :

```txt
Search notes...
```

Ne pas faire de recherche lourde directement dans la topbar.

---

# 15. UI — SearchModal

Créer `SearchModal.vue`.

Layout :

```txt
┌──────────────────────────────────────────────┐
│ Search notes...                              │
├──────────────────────────────────────────────┤
│ Smart | Exact | Semantic                     │
├──────────────────────────────────────────────┤
│ Search index: ready / indexing / error       │
├──────────────────────────────────────────────┤
│ results...                                   │
└──────────────────────────────────────────────┘
```

Comportement :

```txt
input autofocus
debounce 300 ms
appel IPC search
loading state
empty state
error state
```

Modes :

```txt
Smart      défaut
Exact      recherche texte
Semantic   recherche par sens
```

Pour la V1, si Exact/Semantic ne sont pas entièrement séparés côté Vectra :

```txt
Smart peut être le seul mode réellement complet
Exact et Semantic peuvent être présents mais marqués comme beta
```

Ne pas coder trois moteurs complexes.

## Vérification étape 15

Manuel :

```txt
Ctrl+K ouvre la modal
Escape ferme la modal
taper une query affiche des résultats
query vide affiche un état vide
erreur index affiche un message propre
```

---

# 16. UI — SearchResultItem

Créer `SearchResultItem.vue`.

Chaque résultat affiche :

```txt
titre
chemin relatif
snippets
type de match
bouton ouvrir
```

Exemple :

```txt
World Model Memory Architecture
Research/AI/world-model.md

"...latent memory can retrieve similar states over time..."

Match: Semantic + keyword
```

Ne pas afficher les scores techniques par défaut.

Convertir le score en label :

```txt
Very close
Close
Related
Weak match
```

Règle simple :

```txt
score >= 0.85 → Very close
score >= 0.70 → Close
score >= 0.55 → Related
else → Weak match
```

## Vérification étape 16

Manuel :

```txt
résultat lisible
snippet affiché
chemin affiché
clic ouvre la note
pas de score brut moche dans l’UI principale
```

---

# 17. Ouvrir un résultat de recherche

Quand l’utilisateur clique sur un résultat :

```txt
récupérer relativePath depuis URI
vérifier chemin dans vault
ouvrir la note avec l’éditeur MarkText/Muya existant
fermer la SearchModal
```

Ne pas créer un nouvel éditeur.

Réutiliser l’ouverture de fichier existante de MarkText.

## Vérification étape 17

Manuel :

```txt
chercher une note
cliquer résultat
la bonne note s’ouvre
l’éditeur existant est utilisé
aucune duplication bizarre de fichier
```

---

# 18. Rebuild et Clear index

Ajouter dans la SearchModal ou Settings :

```txt
Rebuild search index
Clear search index
Disable semantic search
```

## 18.1 Rebuild

Effet :

```txt
supprimer l’index Vectra
recréer l’index
rescanner toutes les notes Markdown
recalculer les embeddings
```

Ne jamais supprimer les notes.

## 18.2 Clear

Effet :

```txt
supprimer uniquement .elephantnote/search/vectra
garder les notes
garder workspace.json
```

Au prochain lancement ou sur rebuild, l’index sera recréé.

## 18.3 Disable

Effet :

```txt
désactiver la recherche sémantique
garder éventuellement une recherche basique
ne pas supprimer les notes
```

Config :

```json
{
  "semanticSearch": {
    "enabled": true,
    "backend": "vectra",
    "embeddingProvider": "transformers-local",
    "model": "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    "allowRemoteProviders": false,
    "requireApiKey": false,
    "uploadNotes": false
  }
}
```

## Vérification étape 18

Manuel :

```txt
Rebuild supprime et recrée l’index
Clear supprime l’index sans toucher aux notes
Disable empêche la recherche sémantique
aucune note n’est modifiée
```

---

# 19. Gestion des erreurs

Gérer explicitement :

```txt
modèle introuvable
échec téléchargement modèle
pas d’Internet au premier téléchargement
modèle incompatible
index Vectra corrompu
fichier Markdown illisible
permission refusée
vault déplacée
fichier supprimé pendant indexation
erreur watcher
```

Comportement :

```txt
ne pas crasher l’app
afficher un message propre
logger dans .elephantnote/search/logs/search.log
proposer Rebuild index si index corrompu
proposer Retry model download si modèle absent
```

Messages UI :

```txt
Semantic search is not ready yet.
The local embedding model is still loading.
The search index seems corrupted. Please rebuild it.
This vault cannot be indexed because of a permission error.
```

## Vérification étape 19

Tests/manuels :

```txt
supprimer dossier vectra pendant app ouverte
ouvrir vault sans permission
couper Internet avant téléchargement modèle
supprimer une note pendant indexation
```

L’app ne doit pas crasher.

---

# 20. Performance minimale

Objectif :

```txt
l’éditeur reste fluide
l’indexation tourne en arrière-plan
la recherche ne relit pas toutes les notes à chaque frappe
```

Règles :

```txt
debounce recherche : 300 ms
debounce watcher : 1000–2000 ms
limit résultats : 20 par défaut
limit max : 50
pas d’indexation parallèle massive en V1
pas de recalcul complet à chaque lancement
```

Si possible, garder un état d’index :

```txt
fichier
mtime
size
lastIndexedAt
```

Mais ne pas recréer une base maison si Vectra gère déjà ça.

---

# 21. Tests finaux obligatoires

## 21.1 Test local-only

Chercher dans le code :

```txt
OpenAI
Anthropic
Cohere
Voyage
Pinecone
Qdrant
Weaviate
apiKey
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

Résultat attendu :

```txt
aucun usage réel
aucun provider cloud
aucun champ API key dans l’UI
```

## 21.2 Test première indexation

Vault :

```txt
Vault/
  note1.md
  note2.md
  Research/world-model.md
```

Résultat :

```txt
les 3 notes sont trouvables
la recherche sémantique fonctionne
l’index est dans .elephantnote/search/vectra
```

## 21.3 Test création note

Action :

```txt
New note
écrire "Le modèle de monde utilise une mémoire latente"
chercher "IA qui se souvient de mes idées"
```

Résultat attendu :

```txt
la note doit apparaître
```

## 21.4 Test modification note

Action :

```txt
modifier une note existante
chercher le nouveau contenu
```

Résultat attendu :

```txt
ancien contenu moins visible
nouveau contenu trouvable
```

## 21.5 Test suppression note

Action :

```txt
supprimer une note
chercher son contenu
```

Résultat attendu :

```txt
elle ne doit plus apparaître
```

## 21.6 Test rebuild

Action :

```txt
Clear index
Search
Rebuild index
Search
```

Résultat attendu :

```txt
après Clear, index indisponible
après Rebuild, résultats revenus
notes intactes
```

---

# 22. Critères d’acceptation finaux

La fonctionnalité est validée uniquement si :

```txt
l’app ne demande aucune clé API
l’app ne contient aucun provider cloud actif
les notes ne sortent jamais de la machine
Vectra est utilisé comme backend
le modèle local par défaut est configuré
l’index est stocké dans .elephantnote/search/vectra
une nouvelle note est indexée
une note modifiée est réindexée
une note supprimée disparaît des résultats
la recherche fonctionne depuis Ctrl+K
cliquer un résultat ouvre la bonne note
l’UI ne bloque pas pendant l’indexation
Clear index ne supprime aucune note
Rebuild index fonctionne
les dossiers interdits sont ignorés
les chemins hors vault sont rejetés
```

---

# 23. Ordre exact de développement

Codex doit suivre cet ordre et ne pas sauter d’étape.

```txt
1. Ajouter les types searchTypes.ts
2. Ajouter pathSafety.ts + tests
3. Ajouter markdownToSearchText.ts + tests
4. Installer vectra + @huggingface/transformers
5. Créer VectraIndexManager.ts
6. Tester init/upsert/query/delete en isolation
7. Créer ElephantSearchService.ts
8. Ajouter scan initial de vault
9. Ajouter watcher
10. Ajouter IPC main/preload
11. Ajouter searchStore côté renderer
12. Ajouter SearchModal
13. Ajouter SearchResultItem
14. Brancher Ctrl+K et SearchBox
15. Brancher ouverture de note
16. Ajouter rebuild/clear/disable
17. Tester local-only
18. Tester création/modification/suppression
19. Nettoyer code et logs
20. Documenter la feature
```

Ne pas faire l’UI avant d’avoir validé le backend minimal.

---

# 24. Prompt court à donner à Codex avant chaque étape

Utiliser ce format :

```txt
Implement only step X from the ElephantNote semantic search specification.

Do not implement future steps.
Do not add cloud providers.
Do not add API keys.
Do not rewrite unrelated UI.
Do not refactor MarkText globally.

After implementation:
- run typecheck
- run related tests
- summarize modified files
- explain how to manually verify the step
```

---

# 25. Prompt principal à donner à Codex

```txt
Implement ElephantNote local semantic search step by step.

Use the existing MIT-licensed project Vectra as the local search/indexing backend.

Use:
- vectra
- @huggingface/transformers
- default local model: Xenova/paraphrase-multilingual-MiniLM-L12-v2

Strict requirements:
- no API key
- no OpenAI
- no Anthropic
- no Google
- no Cohere
- no Voyage
- no Pinecone
- no Qdrant Cloud
- no Weaviate Cloud
- no remote embeddings
- no remote LLM
- no cloud provider
- no note upload
- no hidden telemetry
- no embeddings inside Markdown files

The Markdown files are the source of truth.
The Vectra index is only a rebuildable local cache.

Index path:
<VaultRoot>/.elephantnote/search/vectra/

Model:
The default embedding model must run locally through Transformers.js.
If missing, it may be downloaded once without API key and then cached locally.
After the model is available, search must work offline.

Architecture:
- Renderer only talks through IPC.
- Main process owns filesystem, Vectra, indexing, embeddings, and watchers.
- Renderer must not import fs, path, Vectra, or Transformers.js directly.
- Search must not block the editor UI.

Required backend files:
src/main/elephantnote/search/searchTypes.ts
src/main/elephantnote/search/pathSafety.ts
src/main/elephantnote/search/markdownToSearchText.ts
src/main/elephantnote/search/VectraIndexManager.ts
src/main/elephantnote/search/ElephantSearchService.ts
src/main/elephantnote/search/VaultSearchWatcher.ts
src/main/elephantnote/search/searchIpc.ts

Required renderer files:
src/renderer/elephantnote/search/searchStore.ts
src/renderer/elephantnote/search/SearchModal.vue
src/renderer/elephantnote/search/SearchResultItem.vue
src/renderer/elephantnote/search/SearchStatusBadge.vue

Behavior:
- On vault open, initialize search in background.
- On first index creation, index all Markdown notes.
- On note creation, upsert into Vectra.
- On note modification, debounce and upsert.
- On note deletion, remove from Vectra.
- Search box opens SearchModal.
- Ctrl+K or Cmd+K opens SearchModal.
- SearchModal calls IPC.
- Results show title, path, snippets, and match type.
- Clicking result opens the note in the existing MarkText/Muya editor.
- User can rebuild the index.
- User can clear the index.
- User can disable semantic search.

Ignore:
- .elephantnote
- .git
- node_modules
- dist
- build
- temp files

Acceptance:
- no API key appears anywhere
- no cloud provider is used
- notes never leave the machine
- new notes appear in search
- modified notes update in search
- deleted notes disappear from search
- local semantic search works
- hybrid search works if supported by Vectra
- app remains responsive during indexing
- rebuild index works
- clear index does not delete notes
```

---

# 26. Recommandation de pilotage

Ne donne pas tout à Codex en mode “fais tout”. Donne-lui le document complet, puis demande :

```txt
Start with steps 1, 2 and 3 only.
Do not implement Vectra yet.
```

Ensuite :

```txt
Now implement step 4, 5 and 6 only.
```

Puis :

```txt
Now implement IPC only.
```

Puis :

```txt
Now implement the SearchModal UI only.
```

C’est le meilleur moyen d’éviter qu’il parte dans un délire, qu’il ajoute OpenAI, qu’il code une base SQLite maison, ou qu’il casse MarkText.

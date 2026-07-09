from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


def regex_once(content: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


# 1. Search store: preserve vault identity, deduplicate initialization, and accept Rust snake_case.
path = "Elephant/frontend/app/stores/searchStore.js"
content = read(path)
content = replace_once(
    content,
    "const normalizeBackendResult = (result = {}) => ({\n  ...result,\n  relativePath: normalizeRelativePath(result.relativePath || result.path || ''),\n  path: normalizeRelativePath(result.path || result.relativePath || '')\n})",
    "export const normalizeBackendResult = (result = {}) => ({\n  ...result,\n  relativePath: normalizeRelativePath(result.relativePath || result.relative_path || result.path || ''),\n  path: normalizeRelativePath(result.path || result.relativePath || result.relative_path || ''),\n  chunkId: result.chunkId || result.chunk_id || '',\n  startOffset: Number(result.startOffset ?? result.start_offset ?? 0) || 0,\n  endOffset: Number(result.endOffset ?? result.end_offset ?? 0) || 0\n})",
    "normalizeBackendResult",
)
content = replace_once(
    content,
    "const emptyInspection = () => ({ ...EMPTY_INSPECTION })",
    "const emptyInspection = () => ({ ...EMPTY_INSPECTION })\n\nconst vaultInitializationPromises = new Map()\n\nexport const normalizeSearchStatus = (status = {}, vaultPath = '') => {\n  const indexedDocuments = Number(\n    status.indexedDocuments ?? status.notesIndexed ?? status.documents ?? 0\n  ) || 0\n  const normalizedStatus = String(status.status || '').trim() || (status.enabled === false\n    ? 'disabled'\n    : indexedDocuments > 0\n      ? 'ready'\n      : 'empty')\n  return {\n    ...DEFAULT_STATUS,\n    ...status,\n    status: normalizedStatus,\n    vaultPath: String(status.vaultPath || vaultPath || ''),\n    indexedDocuments,\n    totalDocuments: Number(status.totalDocuments ?? indexedDocuments) || indexedDocuments,\n    message: String(status.message || ''),\n    error: String(status.error || '')\n  }\n}",
    "normalizeSearchStatus insertion",
)
content = replace_once(
    content,
    "    vaultPath: '',\n    query: '',",
    "    vaultPath: '',\n    initializedVaultPath: '',\n    query: '',",
    "initializedVaultPath state",
)
content = regex_once(
    content,
    r"    async ensureActiveVault\(\) \{.*?\n    \},\n\n    open\(\) \{",
    """    async ensureActiveVault() {
      const vaultStore = useVaultStore()
      const vaultPath = vaultStore.activeVault?.path || this.vaultPath
      if (!vaultPath) {
        searchLog('ensureActiveVault:no-vault')
        return this.status
      }

      this.vaultPath = vaultPath
      if (this.initializedVaultPath === vaultPath && this.status.vaultPath === vaultPath) {
        return this.status
      }

      let initialization = vaultInitializationPromises.get(vaultPath)
      if (!initialization) {
        searchLog('ensureActiveVault:init:start', { vaultPath, previousVaultPath: this.initializedVaultPath || '' })
        this.indexInspection = emptyInspection()
        this.results = []
        this.conceptResults = []
        this.conceptRoute = null
        initialization = elephantnoteClient.search.initVault(vaultPath)
        vaultInitializationPromises.set(vaultPath, initialization)
      } else {
        searchLog('ensureActiveVault:init:join', { vaultPath })
      }

      try {
        const rawStatus = await initialization
        this.status = normalizeSearchStatus(rawStatus, vaultPath)
        this.initializedVaultPath = vaultPath
        this.lastStatusRefreshAt = Date.now()
        searchLog('ensureActiveVault:init:done', {
          vaultPath,
          status: this.status.status,
          indexedDocuments: this.status.indexedDocuments
        })
      } finally {
        if (vaultInitializationPromises.get(vaultPath) === initialization) {
          vaultInitializationPromises.delete(vaultPath)
        }
      }
      return this.status
    },

    open() {""",
    "ensureActiveVault replacement",
)
content = replace_once(
    content,
    "        this.status = await elephantnoteClient.search.status()",
    "        this.status = normalizeSearchStatus(await elephantnoteClient.search.status(), this.vaultPath)",
    "refreshStatus normalization",
)
content = replace_once(
    content,
    "        this.status = await elephantnoteClient.search.rebuild()\n        this.lastStatusRefreshAt = Date.now()\n        searchLog('rebuild:done', { status: this.status?.status || '', provider: this.status?.provider || '', documents: this.status?.documents || this.status?.notesIndexed || 0 })\n        this.pollIndexBuild()",
    "        this.status = normalizeSearchStatus(await elephantnoteClient.search.rebuild(), this.vaultPath)\n        this.lastStatusRefreshAt = Date.now()\n        searchLog('rebuild:done', { status: this.status.status, provider: this.status.provider || '', documents: this.status.indexedDocuments })\n        if (this.status.status === 'indexing') this.pollIndexBuild()",
    "rebuild normalization",
)
content = replace_once(
    content,
    "      this.status = await elephantnoteClient.search.disable()",
    "      this.status = normalizeSearchStatus(await elephantnoteClient.search.disable(), this.vaultPath)",
    "disable normalization",
)
content = replace_once(
    content,
    "      this.status = await elephantnoteClient.search.enable()",
    "      this.status = normalizeSearchStatus(await elephantnoteClient.search.enable(), this.vaultPath)",
    "enable normalization",
)
content = replace_once(
    content,
    "        this.status = await elephantnoteClient.search.initVault(vaultPath)",
    "        this.status = normalizeSearchStatus(await elephantnoteClient.search.initVault(vaultPath), vaultPath)\n        this.initializedVaultPath = vaultPath",
    "enable init normalization",
)
write(path, content)


# 2. Rust relations: duplicate wikilinks in one document must not violate the primary key.
path = "Elephant/backend/knowledge-core/src/relation_storage.rs"
content = read(path)
content = replace_once(
    content,
    "use rusqlite::{params, Connection, OptionalExtension};\nuse std::path::Path;",
    "use rusqlite::{params, Connection, OptionalExtension};\nuse std::collections::HashSet;\nuse std::path::Path;",
    "relation HashSet import",
)
content = replace_once(
    content,
    "        let mut inserted = 0usize;\n        for link in &document.explicit_links {",
    "        let mut inserted = 0usize;\n        let mut seen_relation_ids = HashSet::new();\n        for link in &document.explicit_links {",
    "relation dedupe set",
)
content = replace_once(
    content,
    "            let evidence = \"[]\";\n            transaction",
    "            if !seen_relation_ids.insert(relation.id.clone()) {\n                eprintln!(\n                    \"[Knowledge][Relations] duplicate:skip source={} target={} relation_id={}\",\n                    document.relative_path, link.target, relation.id\n                );\n                continue;\n            }\n            let evidence = \"[]\";\n            transaction",
    "relation duplicate guard",
)
content = replace_once(
    content,
    "        assert_eq!(relations[0].target.id, \"B\");\n        fs::remove_dir_all(root).ok();\n    }\n\n    #[test]\n    fn rejects_model_relation_with_unknown_evidence()",
    "        assert_eq!(relations[0].target.id, \"B\");\n        fs::remove_dir_all(root).ok();\n    }\n\n    #[test]\n    fn duplicate_markdown_wikilinks_are_stored_once() {\n        let root = temp_vault(\"duplicate-markdown\");\n        fs::create_dir_all(&root).unwrap();\n        let mut store = KnowledgeStore::open(&root).unwrap();\n        let document = analyze_markdown(\"A.md\", \"# A\\n[[B]] then [[B]] again.\", 1);\n        store.upsert_document(&document).unwrap();\n\n        assert_eq!(store.sync_markdown_relations(&document).unwrap(), 1);\n        let relations = store\n            .relations_for_node(&document_node(\"A.md\"), false)\n            .unwrap();\n        assert_eq!(relations.len(), 1);\n        assert_eq!(relations[0].target.id, \"B\");\n        fs::remove_dir_all(root).ok();\n    }\n\n    #[test]\n    fn rejects_model_relation_with_unknown_evidence()",
    "duplicate relation test",
)
write(path, content)


# 3. Rebuild logging: keep errors and progress, but avoid thousands of lines for unchanged files.
path = "Elephant/backend/knowledge-core/src/pipeline.rs"
content = read(path)
content = replace_once(
    content,
    "pub fn rebuild_vault(vault_root: &Path) -> Result<RebuildReport, String> {\n    let started_at = Instant::now();",
    "pub fn rebuild_vault(vault_root: &Path) -> Result<RebuildReport, String> {\n    let started_at = Instant::now();\n    let verbose = verbose_rebuild_logs();",
    "verbose rebuild flag",
)
content = replace_once(
    content,
    "        eprintln!(\"[Knowledge][Rebuild] file:start path={relative_path}\");",
    "        if verbose {\n            eprintln!(\"[Knowledge][Rebuild] file:start path={relative_path}\");\n        }",
    "file start verbosity",
)
content = replace_once(
    content,
    "                        eprintln!(\n                            \"[Knowledge][Rebuild] file:unchanged path={} relations={} duration_ms={}\",\n                            relative_path,\n                            relation_count.unwrap_or(0),\n                            file_started_at.elapsed().as_millis()\n                        );",
    "                        if verbose {\n                            eprintln!(\n                                \"[Knowledge][Rebuild] file:unchanged path={} relations={} duration_ms={}\",\n                                relative_path,\n                                relation_count.unwrap_or(0),\n                                file_started_at.elapsed().as_millis()\n                            );\n                        }",
    "unchanged verbosity",
)
content = replace_once(
    content,
    "                        eprintln!(\n                            \"[Knowledge][Rebuild] file:indexed path={} sections={} chunks={} explicit_links={} relations={} outdated_wikis={} duration_ms={}\",\n                            relative_path,\n                            sections,\n                            chunks,\n                            explicit_links,\n                            relations,\n                            outdated_wikis,\n                            file_started_at.elapsed().as_millis()\n                        );",
    "                        if verbose {\n                            eprintln!(\n                                \"[Knowledge][Rebuild] file:indexed path={} sections={} chunks={} explicit_links={} relations={} outdated_wikis={} duration_ms={}\",\n                                relative_path,\n                                sections,\n                                chunks,\n                                explicit_links,\n                                relations,\n                                outdated_wikis,\n                                file_started_at.elapsed().as_millis()\n                            );\n                        }",
    "indexed verbosity",
)
content = replace_once(
    content,
    "        }\n    }\n\n    report.removed = store.prune_documents",
    "        }\n\n        if report.scanned % 100 == 0 {\n            eprintln!(\n                \"[Knowledge][Rebuild] progress scanned={} total={} indexed={} unchanged={} failed={} elapsed_ms={}\",\n                report.scanned,\n                present_paths.len().max(report.scanned),\n                report.indexed,\n                report.unchanged,\n                report.failed.len(),\n                started_at.elapsed().as_millis()\n            );\n        }\n    }\n\n    report.removed = store.prune_documents",
    "rebuild progress",
)
for label, old, new in [
    (
        "ignored scan verbosity",
        "            eprintln!(\n                \"[Knowledge][Rebuild] scan:skip reason=ignored path={}\",\n                path.display()\n            );",
        "            if verbose_rebuild_logs() {\n                eprintln!(\n                    \"[Knowledge][Rebuild] scan:skip reason=ignored path={}\",\n                    path.display()\n                );\n            }",
    ),
    (
        "symlink scan verbosity",
        "            eprintln!(\n                \"[Knowledge][Rebuild] scan:skip reason=symlink path={}\",\n                path.display()\n            );",
        "            if verbose_rebuild_logs() {\n                eprintln!(\n                    \"[Knowledge][Rebuild] scan:skip reason=symlink path={}\",\n                    path.display()\n                );\n            }",
    ),
    (
        "outside scan verbosity",
        "                eprintln!(\n                    \"[Knowledge][Rebuild] scan:skip reason=outside_vault path={}\",\n                    canonical.display()\n                );",
        "                if verbose_rebuild_logs() {\n                    eprintln!(\n                        \"[Knowledge][Rebuild] scan:skip reason=outside_vault path={}\",\n                        canonical.display()\n                    );\n                }",
    ),
]:
    content = replace_once(content, old, new, label)
content = replace_once(
    content,
    "fn ignored_name(name: &str) -> bool {",
    "fn verbose_rebuild_logs() -> bool {\n    std::env::var(\"ELEPHANTNOTE_KNOWLEDGE_VERBOSE\")\n        .map(|value| matches!(value.as_str(), \"1\" | \"true\" | \"yes\" | \"on\"))\n        .unwrap_or(false)\n}\n\nfn ignored_name(name: &str) -> bool {",
    "verbose helper",
)
write(path, content)


# 4. Run filesystem-heavy rebuild work away from Tauri's async command executor.
path = "Elephant/backend/tauri/src/knowledge.rs"
content = read(path)
content = replace_once(
    content,
    "#[tauri::command]\npub fn tauri_knowledge_rebuild(app: AppHandle) -> Result<RebuildReport, String> {\n    let root = active_vault_root(&app)?;\n    rebuild_vault(Path::new(&root))\n}",
    "#[tauri::command]\npub async fn tauri_knowledge_rebuild(app: AppHandle) -> Result<RebuildReport, String> {\n    let root = active_vault_root(&app)?;\n    tauri::async_runtime::spawn_blocking(move || rebuild_vault(Path::new(&root)))\n        .await\n        .map_err(|error| format!(\"Knowledge rebuild worker failed: {error}\"))?\n}",
    "async rebuild command",
)
write(path, content)


# 5. Graph rendering window: do not create thousands of SVG elements in one frame.
path = "Elephant/frontend/app/components/views/graphNavigationHelpers.js"
content = read(path)
marker = "export const fitCameraToNodes = ({"
if marker not in content:
    raise RuntimeError("graph window marker missing")
window_function = """export const buildGlobalGraphWindow = ({
  nodes = [],
  edges = [],
  clusters = [],
  maxNodes = 320
} = {}) => {
  const limit = Math.max(32, Math.trunc(Number(maxNodes) || 320))
  const totalNodeCount = nodes.length
  if (totalNodeCount <= limit) {
    return { nodes, edges, clusters, totalNodeCount, hiddenNodeCount: 0 }
  }

  const degree = new Map()
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }
  const ranked = [...nodes].sort((left, right) => {
    const leftWiki = left.kind === 'wiki' ? 1 : 0
    const rightWiki = right.kind === 'wiki' ? 1 : 0
    if (leftWiki !== rightWiki) return rightWiki - leftWiki
    const degreeDelta = (degree.get(right.id) || 0) - (degree.get(left.id) || 0)
    if (degreeDelta !== 0) return degreeDelta
    const sourceDelta = Number(right.sourceCount || 0) - Number(left.sourceCount || 0)
    if (sourceDelta !== 0) return sourceDelta
    return String(left.title || left.id).localeCompare(String(right.title || right.id))
  })
  const visibleNodes = ranked.slice(0, limit)
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  return {
    nodes: visibleNodes,
    edges: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    clusters,
    totalNodeCount,
    hiddenNodeCount: Math.max(0, totalNodeCount - visibleNodes.length)
  }
}

"""
content = content.replace(marker, window_function + marker, 1)
write(path, content)


# 6. Graph view: reuse loaded data, cap global rendering, and remove the huge reactive ID string.
path = "Elephant/frontend/app/components/views/GraphView.vue"
content = read(path)
content = replace_once(
    content,
    "          {{ displayGraph.nodes.length }} visible nodes · {{ displayGraph.edges.length }} visible links",
    "          {{ displayGraph.nodes.length }} visible nodes · {{ displayGraph.edges.length }} visible links · {{ graph.nodes.length }} indexed\n          <span v-if=\"!semanticCenter && globalGraphWindow.hiddenNodeCount\"> · {{ globalGraphWindow.hiddenNodeCount }} deferred</span>",
    "graph header counts",
)
content = replace_once(
    content,
    "            <span>{{ zoomPercent }}%</span>",
    "            <button\n              v-if=\"!semanticCenter && globalGraphWindow.hiddenNodeCount\"\n              type=\"button\"\n              title=\"Render more indexed notes\"\n              @click=\"loadMoreGraphNodes\"\n            >\n              Load more\n            </button>\n            <span>{{ zoomPercent }}%</span>",
    "graph load more button",
)
content = replace_once(
    content,
    "  buildAdjacency,\n  buildSemanticNeighborhood,",
    "  buildAdjacency,\n  buildGlobalGraphWindow,\n  buildSemanticNeighborhood,",
    "graph window import",
)
content = replace_once(
    content,
    "const semanticDepth = ref(1)",
    "const semanticDepth = ref(1)\nconst globalNodeLimit = ref(320)",
    "global node limit",
)
content = replace_once(
    content,
    "let zoomLogTimer = null\nconst zoomLogState = ref(null)",
    "let zoomLogTimer = null\nlet graphLoadPromise = null\nlet graphLoadedVaultPath = ''\nconst zoomLogState = ref(null)",
    "graph load state",
)
content = replace_once(
    content,
    "const globalLayout = computed(() => layoutWikiTerritories({\n  nodes: graph.value.nodes,\n  edges: graph.value.edges,\n  clusters: graph.value.clusters,",
    "const globalGraphWindow = computed(() => buildGlobalGraphWindow({\n  nodes: graph.value.nodes,\n  edges: graph.value.edges,\n  clusters: graph.value.clusters,\n  maxNodes: globalNodeLimit.value\n}))\n\nconst globalLayout = computed(() => layoutWikiTerritories({\n  nodes: globalGraphWindow.value.nodes,\n  edges: globalGraphWindow.value.edges,\n  clusters: globalGraphWindow.value.clusters,",
    "global graph window computed",
)
content = replace_once(
    content,
    "      nodes: graph.value.nodes,\n      edges: graph.value.edges,\n      distances: new Map(),\n      adjacency: buildAdjacency(graph.value.nodes, graph.value.edges)",
    "      nodes: globalGraphWindow.value.nodes,\n      edges: globalGraphWindow.value.edges,\n      distances: new Map(),\n      adjacency: buildAdjacency(globalGraphWindow.value.nodes, globalGraphWindow.value.edges)",
    "display graph window",
)
content = replace_once(
    content,
    "  return buildSemanticViewModel({ graph: graph.value, width: GRAPH_WIDTH, height: GRAPH_HEIGHT }).nodes",
    "  return buildSemanticViewModel({ graph: globalGraphWindow.value, width: GRAPH_WIDTH, height: GRAPH_HEIGHT }).nodes",
    "fallback layout window",
)
content = replace_once(
    content,
    "const focusPositionedNode = (node, animate = true) => {",
    "const loadMoreGraphNodes = async() => {\n  const previousLimit = globalNodeLimit.value\n  globalNodeLimit.value = Math.min(graph.value.nodes.length, previousLimit + 320)\n  await nextTick()\n  log.info('[Graph][Render] window:expand', {\n    previousLimit,\n    nextLimit: globalNodeLimit.value,\n    visibleNodes: globalGraphWindow.value.nodes.length,\n    hiddenNodes: globalGraphWindow.value.hiddenNodeCount\n  })\n  fitGraph(true, 'render-window-expand')\n}\n\nconst focusPositionedNode = (node, animate = true) => {",
    "load more function",
)
content = regex_once(
    content,
    r"const loadGraph = async\(reason\) => \{.*?\n\}\n\nonMounted",
    """const loadGraph = async(reason, { force = false } = {}) => {
  const vaultPath = store.activeVault?.path || ''
  if (graphLoadPromise) {
    log.debug('[Graph][Data] inspect:join', { reason, vaultPath })
    return graphLoadPromise
  }
  if (!force && searchStore.indexInspection?.graph?.nodes?.length && graphLoadedVaultPath === vaultPath) {
    log.info('[Graph][Data] inspect:reuse', {
      reason,
      vaultPath,
      nodes: graph.value.nodes.length,
      edges: graph.value.edges.length
    })
    await nextTick()
    fitGraph(false, `reuse:${reason}`)
    return searchStore.indexInspection
  }

  const startedAt = performance.now()
  log.info('[Graph][Data] inspect:start', { reason, vaultPath: vaultPath || null })
  graphLoadPromise = (async() => {
    try {
      await searchStore.inspect()
      graphLoadedVaultPath = vaultPath
      await nextTick()
      log.info('[Graph][Data] inspect:complete', {
        reason,
        durationMs: Math.round(performance.now() - startedAt),
        nodes: graph.value.nodes.length,
        renderedNodes: globalGraphWindow.value.nodes.length,
        deferredNodes: globalGraphWindow.value.hiddenNodeCount,
        notes: graph.value.nodes.filter((node) => node.kind === 'note').length,
        wikis: graph.value.nodes.filter((node) => node.kind === 'wiki').length,
        edges: graph.value.edges.length,
        edgeTypes: graphSummary.value,
        clusters: graph.value.clusters.length,
        territoryStats: territoryStats.value
      })
      fitGraph(false, `load:${reason}`)
      return searchStore.indexInspection
    } catch (error) {
      log.error('[Graph][Data] inspect:error', {
        reason,
        durationMs: Math.round(performance.now() - startedAt),
        error: error?.message || String(error)
      })
      throw error
    } finally {
      graphLoadPromise = null
    }
  })()
  return graphLoadPromise
}

onMounted""",
    "loadGraph dedupe",
)
content = replace_once(
    content,
    "  selectedTerritory.value = null\n  log.info('[Graph][Data] vault:change', { oldPath: oldPath || null, newPath: newPath || null })\n  await loadGraph('vault-change').catch(() => {})",
    "  selectedTerritory.value = null\n  globalNodeLimit.value = 320\n  graphLoadedVaultPath = ''\n  log.info('[Graph][Data] vault:change', { oldPath: oldPath || null, newPath: newPath || null })\n  await loadGraph('vault-change', { force: true }).catch(() => {})",
    "vault change graph reset",
)
content = replace_once(
    content,
    "watch(() => graph.value.nodes.map((node) => node.id).join('|'), async() => {",
    "watch(() => `${graph.value.nodes.length}:${graph.value.edges.length}:${graph.value.nodes[0]?.id || ''}:${graph.value.nodes.at(-1)?.id || ''}`, async() => {",
    "compact graph watcher",
)
write(path, content)


# 7. Focused workflow must enable verbose mode only for the log smoke test.
path = ".github/workflows/knowledge-core.yml"
content = read(path)
content = replace_once(
    content,
    "          RUST_TEST_THREADS=1 cargo test \\\n            --manifest-path Elephant/backend/knowledge-core/Cargo.toml \\\n            pipeline::tests::rebuild_is_incremental_and_ignores_hidden_files",
    "          ELEPHANTNOTE_KNOWLEDGE_VERBOSE=1 RUST_TEST_THREADS=1 cargo test \\\n            --manifest-path Elephant/backend/knowledge-core/Cargo.toml \\\n            pipeline::tests::rebuild_is_incremental_and_ignores_hidden_files",
    "verbose log smoke",
)
write(path, content)

print("Knowledge runtime freeze repairs applied.")

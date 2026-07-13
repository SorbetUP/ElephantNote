from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value)


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact match, found {count}: {old[:100]!r}")
    write(path, source.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, updated)


# Graph: remove the misleading zoom slider, keep a single fit/recenter action.
graph = "Elephant/frontend/app/components/views/AtomicGraphView.vue"
regex_once(
    graph,
    r'''      <div class="en-graph-zoom-control">\n        <button[\s\S]*?        <span class="en-graph-zoom-pct">\{\{ Math\.round\(zoomValue \* 100\) \}\}%</span>\n      </div>''',
    '''      <div class="en-graph-zoom-control">
        <button
          type="button"
          class="en-graph-zoom-button"
          title="Ajuster le graphe à la fenêtre"
          @click="resetView"
        >
          <Crosshair class="en-gz-svg" />
        </button>
      </div>''',
)
replace_once(graph, "import { nodeColor } from '../../graph/graphThemes'\n", "")
replace_once(graph, "const zoomValue = ref(1)\n", "")
replace_once(
    graph,
    '''const NODE_PALETTE = [
  '#7c3aed', '#3b82f6', '#22d3ee', '#4ade80',
  '#eab308', '#ec4899', '#ef4444', '#a78bfa'
]
''',
    '''const NODE_PALETTE = [
  '#7c3aed', '#2563eb', '#0891b2', '#16a34a',
  '#ca8a04', '#db2777', '#dc2626', '#9333ea',
  '#0d9488', '#ea580c', '#4f46e5', '#65a30d'
]

function stableColorIndex (value) {
  let hash = 2166136261
  for (const character of String(value || 'note')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % NODE_PALETTE.length
}

function rgbaFromHex (hex, alpha) {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(217,133,69,${alpha})`
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}
''',
)
replace_once(
    graph,
    '''  const { nodes, edges, edgeCounts, maxEdges } = data

  for (const node of nodes) {''',
    '''  const { nodes, edges, edgeCounts, maxEdges } = data
  const wikiIds = nodes
    .filter((node) => (node.kind || node.type) === 'wiki')
    .map((node) => node.id)
    .sort((left, right) => String(left).localeCompare(String(right)))
  const wikiColorById = new Map(wikiIds.map((id, index) => [id, NODE_PALETTE[index % NODE_PALETTE.length]]))
  const territoryByNode = new Map(wikiIds.map((id) => [id, wikiColorById.get(id)]))
  const wikiIdSet = new Set(wikiIds)
  for (const edge of edges) {
    if (edge.type !== 'wiki-source') continue
    const wikiId = wikiIdSet.has(edge.source) ? edge.source : wikiIdSet.has(edge.target) ? edge.target : ''
    if (!wikiId) continue
    const noteId = wikiId === edge.source ? edge.target : edge.source
    if (!territoryByNode.has(noteId)) territoryByNode.set(noteId, wikiColorById.get(wikiId))
  }

  for (const node of nodes) {''',
)
replace_once(
    graph,
    '''    graph.addNode(id, {
      x: node.x,
      y: node.y,
      size: baseSize,
      color: isWiki ? '#d98545' : nodeColor(t, Math.min(1, 0.3 + connectivity), clusterIdx),''',
    '''    const territoryColor = territoryByNode.get(id)
    const fallbackColor = NODE_PALETTE[stableColorIndex(node.clusterId || node.relativePath || node.path || node.title || id)]
    graph.addNode(id, {
      x: node.x,
      y: node.y,
      size: baseSize,
      color: territoryColor || fallbackColor,''',
)
replace_once(
    graph,
    '''      data: node,
      isWiki,
      classified: classifiedNodeIds.value.has(id)''',
    '''      data: node,
      isWiki,
      territoryColor: territoryColor || fallbackColor,
      classified: classifiedNodeIds.value.has(id)''',
)
replace_once(
    graph,
    '''    const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius)
    gradient.addColorStop(0, 'rgba(217,133,69,0.13)')
    gradient.addColorStop(0.72, 'rgba(217,133,69,0.07)')
    gradient.addColorStop(1, 'rgba(217,133,69,0.015)')''',
    '''    const territoryColor = wikiAttrs.territoryColor || wikiAttrs.color || '#d98545'
    const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius)
    gradient.addColorStop(0, rgbaFromHex(territoryColor, 0.16))
    gradient.addColorStop(0.72, rgbaFromHex(territoryColor, 0.075))
    gradient.addColorStop(1, rgbaFromHex(territoryColor, 0.012))''',
)
replace_once(graph, "    ctx.strokeStyle = 'rgba(217,133,69,0.42)'", "    ctx.strokeStyle = rgbaFromHex(territoryColor, 0.48)")
replace_once(graph, "    ctx.fillStyle = 'rgba(235,176,122,0.9)'", "    ctx.fillStyle = rgbaFromHex(territoryColor, 0.94)")
regex_once(
    graph,
    r'''\n  renderer\.getCamera\(\)\.on\('updated', \(\) => \{\n    const state = renderer\.getCamera\(\)\.getState\(\)\n    zoomValue\.value = 1 / state\.ratio\n  \}\)\n''',
    "\n",
)
replace_once(
    graph,
    '''  renderer.refresh()
  const hasEmbeddingEdges = graph.edges().some((edge) => graph.getEdgeAttribute(edge, 'edgeType') === 'wiki-semantic')
  if (hasEmbeddingEdges) setTimeout(() => runForceSimulation(1200), 0)
}''',
    '''  // The initial deterministic layout is already complete. Never launch the quadratic
  // force simulation automatically: a 1,000+ note vault must become interactive immediately.
  renderer.refresh()
}''',
)
regex_once(
    graph,
    r'''function selectNode \(data, nodeId\) \{[\s\S]*?\n\}\n\nfunction positionCardNearNode''',
    '''function selectNode (data, nodeId) {
  selectedNodeRef = nodeId
  selectTargetRef = 1
  selectedNode.value = data
  cardCollapsed.value = false
  if (cardPos.x === null) positionCardNearNode(nodeId)
  // Selecting a note must not rewrite the camera ratio or make the entire graph jump.
  if (renderer) renderer.refresh()
}

function positionCardNearNode''',
)
regex_once(
    graph,
    r'''\nfunction onZoomSlider \(event\) \{[\s\S]*?\n\}\n''',
    "\n",
)
replace_once(
    graph,
    '''  const nodes = graphInstance.nodes()
  if (nodes.length === 0) {''',
    '''  const nodes = graphInstance.nodes()
    .filter((id) => graphInstance.getNodeAttribute(id, 'classified') === true || graphInstance.degree(id) > 0)
    .slice(0, 280)
  if (nodes.length === 0) {''',
)

# Large Wiki territories use deterministic rings instead of an O(n²) 80-iteration layout.
helpers = "Elephant/frontend/app/components/views/semanticGraphViewHelpers.js"
regex_once(
    helpers,
    r'''    sourceIds\.forEach\(\(id, index\) => \{\n      const angle = angleOffset \+ \(Math\.PI \* 2 \* index\) / Math\.max\(1, sourceIds\.length\)\n      local\.set\(id, \{\n        x: center\.x \+ Math\.cos\(angle\) \* targetRadius,\n        y: center\.y \+ Math\.sin\(angle\) \* targetRadius\n      \}\)\n    \}\)''',
    '''    sourceIds.forEach((id, index) => {
      const ringCapacity = 36
      const ring = Math.floor(index / ringCapacity)
      const ringStart = ring * ringCapacity
      const membersInRing = Math.min(ringCapacity, sourceIds.length - ringStart)
      const angle = angleOffset + (Math.PI * 2 * (index - ringStart)) / Math.max(1, membersInRing)
      const radius = targetRadius + ring * 42
      local.set(id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      })
    })''',
)
replace_once(
    helpers,
    "    for (let iteration = 0; iteration < 80; iteration += 1) {",
    "    const refinementIterations = sourceIds.length <= 96 ? 36 : 0\n    for (let iteration = 0; iteration < refinementIterations; iteration += 1) {",
)

# Hybrid retrieval must be able to return a complete semantic candidate set.
hybrid = "Elephant/backend/tauri/src/knowledge_chat_actions/hybrid_search.rs"
replace_once(hybrid, "    let limit = limit.clamp(1, 100);", "    let limit = limit.clamp(1, 500);")
replace_once(hybrid, "    let candidate_limit = (limit * 12).clamp(48, 1_200) as i64;", "    let candidate_limit = (limit * 12).clamp(48, 6_000) as i64;")
replace_once(hybrid, "    let limit = limit.clamp(1, 100);", "    let limit = limit.clamp(1, 500);")
replace_once(hybrid, "    let candidate_limit = (limit * 5).clamp(20, 300);", "    let candidate_limit = (limit * 6).clamp(24, 2_400);")
replace_once(hybrid, "            store.search(term, candidate_limit.min(80))?,", "            store.search(term, candidate_limit.min(500))?,")

# Candidate discovery keeps the complete semantic cluster instead of exposing only 12/24 notes.
discovery = "Elephant/backend/tauri/src/knowledge_wiki_discovery.rs"
replace_once(discovery, ".filter(|(_, cluster)| cluster.members.len() < 80)", ".filter(|(_, cluster)| cluster.members.len() < 400)")
replace_once(discovery, ".take(24)\n            .map(|index| documents[*index].path.clone())", ".take(400)\n            .map(|index| documents[*index].path.clone())")
replace_once(discovery, ".take(24)\n            .map(|index| documents[*index].title.clone())", ".take(400)\n            .map(|index| documents[*index].title.clone())")

# Wiki generation: use semantic sources, preserve broad candidate counts, and request long articles.
wikis = "Elephant/backend/tauri/src/knowledge_wikis.rs"
replace_once(
    wikis,
    '''use elephantnote_knowledge_core::{
    build_wiki_synthesis_request, collect_wiki_sources, parse_and_render_wiki,''',
    '''use crate::knowledge_chat_actions::hybrid_note_search;
use elephantnote_knowledge_core::{
    build_wiki_synthesis_request, collect_wiki_sources, parse_and_render_wiki,''',
)
replace_once(
    wikis,
    '''const DEFAULT_MAX_DOCUMENTS: usize = 12;
const DEFAULT_MAX_CHUNKS: usize = 64;
const DEFAULT_MAX_SECTIONS: usize = 10;''',
    '''const DEFAULT_MAX_DOCUMENTS: usize = 64;
const DEFAULT_MAX_CHUNKS: usize = 192;
const DEFAULT_MAX_SECTIONS: usize = 20;''',
)
replace_once(wikis, "max_documents.unwrap_or(DEFAULT_MAX_DOCUMENTS).clamp(1, 50)", "max_documents.unwrap_or(DEFAULT_MAX_DOCUMENTS).clamp(1, 240)")
replace_once(wikis, "max_chunks.unwrap_or(DEFAULT_MAX_CHUNKS).clamp(1, 256)", "max_chunks.unwrap_or(DEFAULT_MAX_CHUNKS).clamp(1, 800)")
replace_once(wikis, "    let max_sections = max_sections.unwrap_or(DEFAULT_MAX_SECTIONS).clamp(1, 30);", "    let max_sections = max_sections.unwrap_or(DEFAULT_MAX_SECTIONS).clamp(1, 36);")
replace_once(
    wikis,
    '''            let mut source_paths = group.paths.into_iter().collect::<Vec<_>>();
            source_paths.sort();
            source_paths.truncate(DEFAULT_MAX_DOCUMENTS);''',
    '''            let source_count = group.paths.len();
            let mut source_paths = group.paths.into_iter().collect::<Vec<_>>();
            source_paths.sort();
            source_paths.truncate(400);''',
)
for old in [
    'format!("{} notes partagent le thème #{}", source_paths.len(), topic)',
    '                    source_paths.len(),\n                    topic',
    '                    source_paths.len()\n                )',
    '                source_paths.len(),\n                title_for_topic(&topic),',
]:
    if old in read(wikis):
        replace_once(wikis, old, old.replace('source_paths.len()', 'source_count'))
replace_once(
    wikis,
    '''    if paths.is_empty() {
        for hit in store.search(topic, max_documents.saturating_mul(4).clamp(1, 200))? {
            if seen.insert(hit.relative_path.clone()) {
                paths.push(hit.relative_path);
                if paths.len() >= max_documents {
                    break;
                }
            }
        }
    }''',
    '''    if paths.is_empty() {
        for hit in hybrid_note_search(store, topic, max_documents.saturating_mul(6).clamp(24, 500))? {
            if seen.insert(hit.relative_path.clone()) {
                paths.push(hit.relative_path);
                if paths.len() >= max_documents {
                    break;
                }
            }
        }
    }''',
)
replace_once(
    wikis,
    '''fn select_source_chunks(
    mut sources: Vec<WikiSourceChunk>,
    max_chunks: usize,
) -> Vec<WikiSourceChunk> {
    sources.sort_by(|left, right| {''',
    '''fn compact_wiki_source_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut output = value.chars().take(max_chars).collect::<String>();
    output.push('…');
    output
}

fn select_source_chunks(
    mut sources: Vec<WikiSourceChunk>,
    max_chunks: usize,
) -> Vec<WikiSourceChunk> {
    for source in &mut sources {
        source.text = compact_wiki_source_text(&source.text, 1_400);
    }
    sources.sort_by(|left, right| {''',
)

library = "Elephant/backend/tauri/src/knowledge_wiki_library.rs"
replace_once(
    library,
    '''use crate::knowledge_wikis::{
    tauri_knowledge_wiki_accept, tauri_knowledge_wiki_candidates, tauri_knowledge_wiki_generate,
    WikiCandidate,
};''',
    '''use crate::knowledge_chat_actions::hybrid_note_search;
use crate::knowledge_wikis::{
    tauri_knowledge_wiki_accept, tauri_knowledge_wiki_candidates, tauri_knowledge_wiki_generate,
    WikiCandidate,
};''',
)
replace_once(
    library,
    '''        paths = store
            .search(&topic, 32)?
            .into_iter()
            .map(|hit| hit.relative_path)
            .collect::<Vec<_>>();''',
    '''        paths = hybrid_note_search(&store, &topic, 400)?
            .into_iter()
            .map(|hit| hit.relative_path)
            .collect::<Vec<_>>();''',
)
replace_once(
    library,
    '''    paths.sort();
    paths.dedup();
    paths.truncate(24);''',
    '''    let mut seen_paths = HashSet::new();
    paths.retain(|path| seen_paths.insert(path.clone()));
    paths.truncate(400);''',
)
replace_once(library, "        Some(16),\n        Some(80),\n        Some(12),", "        Some(80),\n        Some(220),\n        Some(22),")
replace_once(library, "        Some(12),\n        Some(64),\n        Some(10),", "        Some(80),\n        Some(220),\n        Some(22),")

# The structured Wiki format remains strict, but now allows verifiable HTTPS citations from Codex web search.
core = "Elephant/backend/knowledge-core/src/wiki_core.rs"
replace_once(
    core,
    '''        system_prompt: format!(
            "You synthesize a cited local wiki from supplied note chunks. Return exactly one JSON object and no prose or Markdown fences. The object must use this exact shape:
{schema}
Every summary and section claim must be an object with text and citation_chunk_ids; summary is always an array, never a string. Every factual claim must cite one or more supplied chunk IDs. Never cite a chunk that was not supplied. Do not place citation markers inside text. Do not repeat the same idea across sections. Return no more than {max_sections} sections. related_wikis contains only short concept names suitable for wikilinks, never file paths."
        ),''',
    '''        system_prompt: format!(
            "You write a long-form, rigorous encyclopedia article from the supplied personal notes and, when the web-search tool is available, current reliable web research. Return exactly one JSON object and no prose or Markdown fences. The object must use this exact shape:
{schema}
Treat the result as a Wikipedia-quality page, not a short summary. Build a substantial introduction and as many useful sections as the evidence supports, up to {max_sections}. Prefer 12–24 sections for broad topics and 3–8 developed paragraph-length claims per section. Cover definitions, context, history, core concepts, mechanisms, variants, applications, comparisons, limitations, controversies, practical implications, terminology and chronology when relevant. Avoid filler, repetition and invented precision. Every summary and section claim must be an object with text and citation_chunk_ids; summary is always an array, never a string. Claims grounded in the vault cite one or more supplied chunk IDs. Claims grounded in web research cite one or more exact absolute HTTPS URLs returned by web search in citation_chunk_ids. Never invent a chunk ID or URL. Do not place citation markers inside text. related_wikis contains only short concept names suitable for wikilinks, never file paths."
        ),''',
)
replace_once(core, "        max_output_tokens: 6_144,", "        max_output_tokens: 24_576,")
replace_once(
    core,
    '''fn validate_claims(
    section: &str,''',
    '''fn is_web_citation(value: &str) -> bool {
    value.starts_with("https://")
        && !value
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
}

fn validate_claims(
    section: &str,''',
)
replace_once(
    core,
    '''            if !allowed_chunks.contains(chunk_id.as_str()) {
                errors.push(format!(
                    "Claim {index} in `{section}` cites an unknown chunk: {chunk_id}."
                ));
            }''',
    '''            if !allowed_chunks.contains(chunk_id.as_str()) && !is_web_citation(chunk_id) {
                errors.push(format!(
                    "Claim {index} in `{section}` cites an unknown chunk or invalid web URL: {chunk_id}."
                ));
            }''',
)
replace_once(
    core,
    '''        for chunk_id in &claim.citation_chunk_ids {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Unknown source chunk while rendering: {chunk_id}"))?;''',
    '''        for chunk_id in &claim.citation_chunk_ids {
            if is_web_citation(chunk_id) {
                references.push(format!("[Source web]({chunk_id})"));
                continue;
            }
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Unknown source chunk while rendering: {chunk_id}"))?;''',
)

# Codex is still filesystem read-only, but explicitly receives its hosted live web-search tool.
codex = "Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs"
replace_once(
    codex,
    '''      "ephemeral": true,
      "environments": [],
      "selectedCapabilityRoots": []''',
    '''      "ephemeral": true,
      "config": {
        "web_search": "live",
        "tools": {
          "web_search": {
            "context_size": "high",
            "allowed_domains": null,
            "location": null
          }
        }
      },
      "environments": [],
      "selectedCapabilityRoots": []''',
)
replace_once(codex, '        "networkAccess": false', '        "networkAccess": true')
replace_once(
    codex,
    '''    fn turn_payload_disables_network_access() {
        let params = turn_start_params("thread", "gpt-test", "/tmp/chat", "hello", None);''',
    '''    fn codex_chat_enables_live_web_search_without_filesystem_writes() {
        let thread = thread_start_params("gpt-test", "/tmp/chat");
        assert_eq!(
            thread
                .pointer("/config/web_search")
                .and_then(Value::as_str),
            Some("live")
        );
        assert_eq!(
            thread
                .pointer("/config/tools/web_search/context_size")
                .and_then(Value::as_str),
            Some("high")
        );
        let params = turn_start_params("thread", "gpt-test", "/tmp/chat", "hello", None);''',
)
replace_once(
    codex,
    '''                .and_then(Value::as_bool),
            Some(false)
        );
    }''',
    '''                .and_then(Value::as_bool),
            Some(true)
        );
    }''',
)

# Source-level regression contract for the exact UX failures reproduced in the 1,393-note vault.
test_path = ROOT / "tests/app/unit/graphWikiScaleRegression.spec.js"
test_path.write_text('''import fs from 'node:fs'\nimport path from 'node:path'\nimport { describe, expect, test } from 'vitest'\n\nconst ROOT = process.cwd()\nconst read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')\n\ndescribe('large-vault graph and Wiki scale regressions', () => {\n  test('does not auto-run the quadratic graph simulation or alter zoom on selection', () => {\n    const source = read('Elephant/frontend/app/components/views/AtomicGraphView.vue')\n    expect(source).not.toContain('runForceSimulation(1200)')\n    expect(source).not.toContain('ratio: 0.4')\n    expect(source).not.toContain('en-graph-zoom-slider')\n    expect(source).toContain('Selecting a note must not rewrite the camera ratio')\n  })\n\n  test('assigns deterministic territory colors instead of one global orange', () => {\n    const source = read('Elephant/frontend/app/components/views/AtomicGraphView.vue')\n    expect(source).toContain('wikiColorById')\n    expect(source).toContain('territoryByNode')\n    expect(source).toContain('rgbaFromHex(territoryColor')\n  })\n\n  test('keeps broad semantic source sets and requests encyclopedic output', () => {\n    const discovery = read('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs')\n    const wikiCore = read('Elephant/backend/knowledge-core/src/wiki_core.rs')\n    expect(discovery).toContain('.take(400)')\n    expect(wikiCore).toContain('Wikipedia-quality page')\n    expect(wikiCore).toContain('max_output_tokens: 24_576')\n  })\n\n  test('enables Codex hosted live web search while keeping read-only sandboxing', () => {\n    const source = read('Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs')\n    expect(source).toContain('"web_search": "live"')\n    expect(source).toContain('"context_size": "high"')\n    expect(source).toContain('"type": TURN_READ_ONLY_SANDBOX')\n  })\n})\n''')

print('Applied graph, Wiki scale, long-form generation and live web-search pass.')

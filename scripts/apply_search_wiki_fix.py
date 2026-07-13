from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

fallback_path = Path('Elephant/frontend/src/renderer/src/platform/tauriSearchConceptFallback.js')
fallback = fallback_path.read_text()
fallback = replace_once(
    fallback,
    """    const results = await target.elephantnote.search.query({ query, mode: 'exact', limit: Math.max(limit * evidenceLimit, limit) })
    const items = Array.isArray(results) ? results.map(normalizeRustSearchResult) : []
    const groups = new Map()
""",
    """    const normalizedQuery = query.toLocaleLowerCase()
    let wikiItems = []
    try {
      const invoke = target.__TAURI__?.core?.invoke
      const library = typeof invoke === 'function'
        ? await invoke('tauri_knowledge_wiki_library_list', { limit: 500 })
        : []
      wikiItems = (Array.isArray(library) ? library : [])
        .filter((entry) => entry.kind === 'wiki' && entry.path)
        .map((entry) => {
          const title = String(entry.title || entry.topic || 'Wiki')
          const topic = String(entry.topic || '')
          const excerpt = String(entry.excerpt || entry.preview || '')
          const titleMatch = title.toLocaleLowerCase().includes(normalizedQuery)
          const topicMatch = topic.toLocaleLowerCase().includes(normalizedQuery)
          const excerptMatch = excerpt.toLocaleLowerCase().includes(normalizedQuery)
          const score = titleMatch ? 1 : topicMatch ? 0.88 : excerptMatch ? 0.68 : 0
          return {
            id: entry.id,
            title,
            score,
            kind: 'wiki',
            wikiPath: normalizeSearchPath(entry.path),
            path: normalizeSearchPath(entry.path),
            excerpt,
            sourceCount: Number(entry.sourcePaths?.length || 0),
            evidenceChunks: []
          }
        })
        .filter((entry) => entry.score > 0)
    } catch (error) {
      console.warn('[search] concepts:fallback:wikis-unavailable', error)
    }

    const results = await target.elephantnote.search.query({ query, mode: 'exact', limit: Math.max(limit * evidenceLimit, limit) })
    const items = Array.isArray(results) ? results.map(normalizeRustSearchResult) : []
    const groups = new Map()
""",
    'load actual Wikis in concept search',
)
fallback = replace_once(
    fallback,
    """    const candidates = [...groups.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
""",
    """    const noteCandidates = [...groups.values()]
    const maxNoteScore = noteCandidates.reduce((maximum, candidate) => Math.max(maximum, Number(candidate.score || 0)), 0)
    for (const candidate of noteCandidates) {
      candidate.score = maxNoteScore > 0
        ? Math.min(0.72, Number(candidate.score || 0) / maxNoteScore * 0.72)
        : 0
      candidate.kind = 'concept'
    }
    const candidates = [...wikiItems, ...noteCandidates]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
""",
    'normalize search candidate scores',
)
fallback_path.write_text(fallback)

modal_path = Path('Elephant/frontend/app/search/SearchModal.vue')
modal = modal_path.read_text()
modal = replace_once(
    modal,
    "                  {{ Math.round((concept.score || 0) * 100) }}%",
    "                  {{ formatConceptScore(concept.score) }}%",
    'clamp concept percentage',
)
modal = replace_once(
    modal,
    """const openConceptEvidence = (concept) => {
  const firstEvidence = concept?.evidenceChunks?.find((chunk) => chunk.relativePath || chunk.documentPath)
  if (!firstEvidence) return
  store.openResult({
    relativePath: firstEvidence.relativePath || firstEvidence.documentPath,
    title: concept.title
  })
}
""",
    """const openConceptEvidence = (concept) => {
  const wikiPath = concept?.wikiPath || (concept?.kind === 'wiki' ? concept?.path : '')
  if (wikiPath) {
    store.openResult({ relativePath: wikiPath, title: concept.title })
    return
  }
  const firstEvidence = concept?.evidenceChunks?.find((chunk) => chunk.relativePath || chunk.documentPath || chunk.path)
  if (!firstEvidence) return
  store.openResult({
    relativePath: firstEvidence.relativePath || firstEvidence.documentPath || firstEvidence.path,
    title: concept.title
  })
}
""",
    'open Wiki concept directly',
)
modal = replace_once(
    modal,
    """const formatConceptMeta = (concept) => {
  const evidenceCount = concept?.evidenceChunks?.length || 0
  if (evidenceCount <= 0) return 'Concept candidate'
""",
    """const formatConceptScore = (score) => {
  const value = Number(score || 0)
  const normalized = value <= 1 ? value : value <= 100 ? value / 100 : 1
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100)
}

const formatConceptMeta = (concept) => {
  if (concept?.kind === 'wiki') {
    const sourceCount = Number(concept?.sourceCount || 0)
    return `${sourceCount} source${sourceCount === 1 ? '' : 's'} · Wiki`
  }
  const evidenceCount = concept?.evidenceChunks?.length || 0
  if (evidenceCount <= 0) return 'Concept candidate'
""",
    'format Wiki concept metadata',
)
modal_path.write_text(modal)

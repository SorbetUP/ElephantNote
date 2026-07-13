const normalizeSearchPath = (value = '') => String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')

const titleFromPath = (path = '') => (normalizeSearchPath(path).split('/').pop() || 'Concept').replace(/\.md$/i, '')

const normalizeRustSearchResult = (result = {}) => ({
  ...result,
  relativePath: normalizeSearchPath(result.relativePath || result.relative_path || result.path || ''),
  path: normalizeSearchPath(result.path || result.relativePath || result.relative_path || ''),
  chunkId: result.chunkId || result.chunk_id || '',
  startOffset: Number(result.startOffset ?? result.start_offset ?? 0) || 0,
  endOffset: Number(result.endOffset ?? result.end_offset ?? 0) || 0
})

export const installTauriSearchConceptFallback = (target = globalThis) => {
  if (!target.__TAURI__ || !target.elephantnote?.search || typeof target.elephantnote.search.concepts === 'function') {
    return false
  }

  target.elephantnote.search.concepts = async(params = {}) => {
    const query = String(params.query || params.q || '').trim()
    const limit = Math.max(1, Math.min(20, Number(params.limit) || 5))
    const evidenceLimit = Math.max(1, Math.min(20, Number(params.evidenceLimit) || 4))
    console.info('[search] concepts:fallback:start', { query, limit, evidenceLimit })
    if (!query) {
      return { runtime: 'tauri-js-fallback', query, candidates: [], ambiguous: false, reason: 'empty-query' }
    }

    const normalizedQuery = query.toLocaleLowerCase()
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
    for (const result of items) {
      const path = result.relativePath
      if (!path) continue
      const parts = path.split('/').filter(Boolean)
      const id = parts.length > 1 ? parts[0] : titleFromPath(path)
      const current = groups.get(id) || {
        id,
        title: id,
        score: 0,
        evidenceChunks: []
      }
      current.score += Number(result.score || 1)
      if (current.evidenceChunks.length < evidenceLimit) {
        current.evidenceChunks.push({
          path,
          title: result.title || titleFromPath(path),
          excerpt: result.excerpt || result.preview || '',
          score: Number(result.score || 1)
        })
      }
      groups.set(id, current)
    }

    const noteCandidates = [...groups.values()]
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
    const route = {
      runtime: 'tauri-js-fallback',
      query,
      candidates,
      ambiguous: candidates.length > 1,
      reason: 'rust-search-concepts-command-unavailable'
    }
    console.info('[search] concepts:fallback:done', {
      query,
      candidates: candidates.length,
      evidence: candidates.reduce((sum, candidate) => sum + candidate.evidenceChunks.length, 0)
    })
    return route
  }

  console.info('[search] concepts:fallback:installed')
  return true
}

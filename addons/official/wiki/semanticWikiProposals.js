const normalizeText = (value = '') => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const slugify = (value = '') => normalizeText(value).replace(/\s+/g, '-') || 'topic'

const overlapRatio = (left = [], right = []) => {
  const leftSet = new Set(left.map(String))
  const rightSet = new Set(right.map(String))
  if (!leftSet.size || !rightSet.size) return 0
  let overlap = 0
  for (const value of leftSet) if (rightSet.has(value)) overlap += 1
  return overlap / Math.min(leftSet.size, rightSet.size)
}

const candidateSources = (candidate) => {
  const paths = Array.isArray(candidate?.sourcePaths) ? candidate.sourcePaths : []
  const titles = Array.isArray(candidate?.sourceTitles) ? candidate.sourceTitles : []
  return paths.map((path, index) => ({
    path: String(path || ''),
    title: String(titles[index] || path || 'Untitled'),
    excerpt: '',
    tags: []
  })).filter((source) => source.path)
}

const qualityLabel = (candidate) => {
  const confidence = Number(candidate?.confidence || 0)
  const distinctiveness = Number(candidate?.distinctiveness || 0)
  if (confidence >= 0.72 && distinctiveness >= 0.08) return 'Strong topic'
  if (confidence >= 0.48) return 'Probable topic'
  return 'Explore'
}

export const semanticCandidateToRecord = (candidate, now = new Date().toISOString()) => {
  const sources = candidateSources(candidate)
  const topic = String(candidate?.topic || candidate?.title || 'Semantic topic').trim()
  const title = String(candidate?.title || topic).trim()
  const sourceCount = Number(candidate?.score || sources.length)
  return {
    id: `wiki-semantic-${slugify(topic)}`,
    topic,
    title,
    summary: String(candidate?.preview || candidate?.reason || `${sourceCount} semantically related notes.`),
    reason: String(candidate?.reason || ''),
    suggestedSections: Array.isArray(candidate?.suggestedSections) ? candidate.suggestedSections : [],
    sources,
    sourceCount,
    coreSourceCount: Number(candidate?.coreSourceCount || sources.length),
    coherence: Number(candidate?.coherence || 0),
    confidence: Number(candidate?.confidence || 0),
    distinctiveness: Number(candidate?.distinctiveness || 0),
    qualityLabel: qualityLabel(candidate),
    status: 'proposed',
    origin: 'semantic',
    createdAt: now,
    updatedAt: now
  }
}

export const discoverSemanticWikiRecords = async (knowledge, existing = [], options = {}) => {
  if (!knowledge || typeof knowledge.embeddingStatus !== 'function' || typeof knowledge.semanticDiscover !== 'function') {
    return { available: false, records: [], reason: 'provider-unavailable' }
  }
  const status = await knowledge.embeddingStatus()
  if (!Number(status?.documents || 0)) {
    return { available: false, records: [], reason: 'embeddings-unavailable', status }
  }
  const candidates = await knowledge.semanticDiscover({
    threshold: Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.72,
    limit: Math.max(1, Number(options.limit || 12)),
    labels: Array.isArray(options.labels) ? options.labels : undefined
  })
  const protectedRecords = (Array.isArray(existing) ? existing : [])
    .filter((record) => record.status !== 'proposed' || record.origin === 'manual')
  const records = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => Number(candidate?.coreSourceCount || candidate?.sourcePaths?.length || 0) >= 3)
    .filter((candidate) => Number(candidate?.confidence || 0) >= 0.18)
    .map((candidate) => semanticCandidateToRecord(candidate))
    .filter((record) => !protectedRecords.some((existingRecord) => {
      const sameTopic = normalizeText(existingRecord.topic || existingRecord.title) === normalizeText(record.topic)
      const overlap = overlapRatio(
        existingRecord.sources?.map((source) => source.path),
        record.sources.map((source) => source.path)
      )
      return sameTopic || overlap >= 0.72
    }))
  return { available: true, records, status }
}

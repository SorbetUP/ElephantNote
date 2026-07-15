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

const parseJsonObject = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const candidates = [raw]
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  if (fenced) candidates.push(fenced)
  const objectStart = raw.indexOf('{')
  const objectEnd = raw.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(raw.slice(objectStart, objectEnd + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }
  return null
}

const normalizeLabel = (value, communityIds) => {
  const communityId = Number(value?.communityId)
  if (!Number.isInteger(communityId) || !communityIds.has(communityId)) return null
  const title = String(value?.title || '').trim().slice(0, 120)
  const topic = String(value?.topic || title).trim().slice(0, 120)
  if (title.length < 2 || topic.length < 2) return null
  return {
    communityId,
    title,
    topic,
    reason: String(value?.reason || '').trim().slice(0, 600),
    preview: String(value?.preview || '').trim().slice(0, 900),
    suggestedSections: (Array.isArray(value?.suggestedSections) ? value.suggestedSections : [])
      .map((section) => String(section || '').trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 12),
    include: value?.include !== false
  }
}

const labelCommunities = async (inference, communities) => {
  if (!inference?.complete || !Array.isArray(communities) || !communities.length) return null
  const evidence = communities.map((community) => ({
    communityId: community.id,
    sourceCount: community.sourcePaths?.length || 0,
    coherence: Number(community.coherence || 0),
    distinctiveness: Number(community.distinctiveness || 0),
    representativeTitles: (community.representativeTitles || []).slice(0, 10),
    representativePaths: (community.representativePaths || []).slice(0, 10)
  }))
  const response = await inference.complete([
    {
      role: 'system',
      content: 'You name evidence-backed knowledge topics. Return strict JSON only. Do not invent notes or move notes between communities.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Qualify each semantic community as a durable Wiki topic.',
        rules: [
          'Use a precise durable title, not a generic word such as Code, Site or Programming.',
          'Set include=false for incoherent, duplicate, accidental or overly generic communities.',
          'Use only supplied evidence.',
          'Return {"labels":[{"communityId":0,"title":"...","topic":"...","reason":"...","preview":"...","suggestedSections":["..."],"include":true}]}.'
        ],
        communities: evidence
      })
    }
  ], { json: true, temperature: 0 })
  const parsed = parseJsonObject(response?.text)
  const communityIds = new Set(communities.map((community) => Number(community.id)))
  const labels = (Array.isArray(parsed?.labels) ? parsed.labels : [])
    .map((label) => normalizeLabel(label, communityIds))
    .filter(Boolean)
  return labels.length ? labels : null
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

  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.72
  const limit = Math.max(1, Number(options.limit || 12))
  let labels = Array.isArray(options.labels) ? options.labels : undefined
  let labeling = labels?.length ? 'provided' : 'deterministic'
  if (!labels && options.inference?.complete && typeof knowledge.semanticCommunities === 'function') {
    try {
      const response = await knowledge.semanticCommunities({ threshold, limit })
      const communities = Array.isArray(response?.communities) ? response.communities : []
      labels = await labelCommunities(options.inference, communities)
      if (labels?.length) labeling = 'ai-inference'
    } catch (error) {
      console.warn('[wiki-addon] AI topic qualification failed; using deterministic package labels', error)
    }
  }

  const candidates = await knowledge.semanticDiscover({ threshold, limit, labels })
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
  return { available: true, records, status, labeling }
}

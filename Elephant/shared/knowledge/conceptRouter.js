import {
  createConceptProfile,
  normalizeKnowledgeText,
  scoreChunkAgainstConcept,
  tokenizeKnowledgeText
} from './knowledgeIndex.js'

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

const unique = (values = []) => [...new Set(values.filter(Boolean))]

const sortByScore = (left, right) =>
  right.score - left.score || String(left.title || left.id || '').localeCompare(String(right.title || right.id || ''))

export const createQueryProfile = (query = '') => {
  const raw = String(query || '').trim()
  const normalized = normalizeKnowledgeText(raw)
  const terms = tokenizeKnowledgeText(raw)
  const quoted = [...raw.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)]
    .map((match) => match[1] || match[2] || match[3])
    .filter(Boolean)
  const isShort = terms.length <= 2
  const isQuestion = /\?$|^(who|what|when|where|why|how|qui|quoi|quand|ou|où|pourquoi|comment)\b/i.test(raw)

  return {
    raw,
    normalized,
    terms,
    quoted,
    isShort,
    isQuestion,
    isAmbiguousCandidate: isShort && !isQuestion
  }
}

const normalizeRecordCitation = (citation = {}) => [
  citation.title,
  citation.path,
  citation.excerpt,
  ...(Array.isArray(citation.tags) ? citation.tags : [])
].filter(Boolean).join(' ')

export const createConceptProfilesFromWikiRecords = (records = []) => records
  .filter((record) => record && ['proposed', 'accepted'].includes(String(record.status || 'proposed')))
  .map((record) => {
    const citations = Array.isArray(record.citations) ? record.citations : []
    const citationTexts = citations.map(normalizeRecordCitation).filter(Boolean)
    const aliases = unique([
      record.topic,
      record.title,
      record.notePath,
      ...citations.map((citation) => citation.title)
    ]).filter((value) => normalizeKnowledgeText(value) !== normalizeKnowledgeText(record.title || record.topic || ''))

    return createConceptProfile({
      id: record.id || `wiki:${normalizeKnowledgeText(record.title || record.topic || 'concept').replace(/\s+/g, '-')}`,
      title: String(record.title || record.topic || 'Wiki concept'),
      aliases,
      positiveTerms: [
        record.topic,
        record.summary,
        ...citationTexts
      ],
      negativeTerms: [],
      positivePrototypeTexts: citationTexts.slice(0, 8),
      negativePrototypeTexts: []
    })
  })

const scoreQueryAgainstConcept = (queryProfile, concept) => {
  const queryTerms = new Set(queryProfile.terms)
  const positiveTerms = new Set(concept.positiveTerms || [])
  const negativeTerms = new Set(concept.negativeTerms || [])
  const titleTerms = tokenizeKnowledgeText(concept.title || '')
  const aliasTexts = concept.aliases || []
  const aliasTerms = new Set(aliasTexts.flatMap((alias) => tokenizeKnowledgeText(alias)))

  const titleOverlap = titleTerms.filter((term) => queryTerms.has(term)).length
  const aliasOverlap = [...aliasTerms].filter((term) => queryTerms.has(term)).length
  const positiveOverlap = [...queryTerms].filter((term) => positiveTerms.has(term)).length
  const negativeOverlap = [...queryTerms].filter((term) => negativeTerms.has(term)).length
  const exactAliasHit = aliasTexts.some((alias) =>
    queryProfile.normalized && normalizeKnowledgeText(alias).includes(queryProfile.normalized)
  )
  const exactTitleHit = queryProfile.normalized && normalizeKnowledgeText(concept.title || '').includes(queryProfile.normalized)

  const titleScore = Math.min(0.3, titleOverlap * 0.15) + (exactTitleHit ? 0.15 : 0)
  const aliasScore = Math.min(0.25, aliasOverlap * 0.1) + (exactAliasHit ? 0.2 : 0)
  const termScore = Math.min(0.35, positiveOverlap * 0.12)
  const negativePenalty = Math.min(0.3, negativeOverlap * 0.1)

  return {
    score: clamp01(titleScore + aliasScore + termScore - negativePenalty),
    signals: {
      title: Number(titleScore.toFixed(4)),
      alias: Number(aliasScore.toFixed(4)),
      positiveTerms: Number(termScore.toFixed(4)),
      negativeTerms: Number(negativePenalty.toFixed(4))
    }
  }
}

const collectEvidenceChunks = ({ chunks = [], concept, limit = 5 }) => chunks
  .map((chunk) => ({
    chunk,
    membership: scoreChunkAgainstConcept(chunk, concept)
  }))
  .filter((item) => item.membership.score > 0)
  .sort((a, b) => b.membership.score - a.membership.score || a.chunk.documentPath.localeCompare(b.chunk.documentPath))
  .slice(0, Math.max(1, Number(limit) || 5))

export const rankConceptsForQuery = ({
  query = '',
  concepts = [],
  chunks = [],
  limit = 5,
  evidenceLimit = 5
} = {}) => {
  const queryProfile = createQueryProfile(query)
  if (!queryProfile.raw || !Array.isArray(concepts) || !concepts.length) {
    return {
      query: queryProfile,
      ambiguous: false,
      candidates: []
    }
  }

  const candidates = concepts.map((concept) => {
    const queryScore = scoreQueryAgainstConcept(queryProfile, concept)
    const evidence = collectEvidenceChunks({ chunks, concept, limit: evidenceLimit })
    const evidenceScore = evidence.length
      ? evidence.reduce((best, item) => Math.max(best, item.membership.score), 0)
      : 0
    const sourceCoverage = evidence.length ? Math.min(0.2, unique(evidence.map((item) => item.chunk.documentPath)).length * 0.05) : 0
    const score = clamp01(queryScore.score + evidenceScore * 0.55 + sourceCoverage)

    return {
      id: concept.id,
      title: concept.title,
      aliases: concept.aliases || [],
      score: Number(score.toFixed(4)),
      confidence: Number(Math.max(queryScore.score, evidenceScore).toFixed(4)),
      matchType: 'concept',
      signals: {
        query: Number(queryScore.score.toFixed(4)),
        evidence: Number(evidenceScore.toFixed(4)),
        sourceCoverage: Number(sourceCoverage.toFixed(4)),
        ...queryScore.signals
      },
      evidenceChunks: evidence.map((item) => ({
        id: item.chunk.id,
        documentPath: item.chunk.documentPath,
        relativePath: item.chunk.relativePath || item.chunk.documentPath,
        chunkIndex: item.chunk.chunkIndex,
        headingPath: item.chunk.headingPath || [],
        score: item.membership.score,
        preview: String(item.chunk.text || item.chunk.content || '').slice(0, 240)
      }))
    }
  })
    .filter((candidate) => candidate.score > 0)
    .sort(sortByScore)
    .slice(0, Math.max(1, Number(limit) || 5))

  const topScore = candidates[0]?.score || 0
  const plausible = candidates.filter((candidate) => candidate.score >= Math.max(0.12, topScore * 0.55))
  const ambiguous = queryProfile.isAmbiguousCandidate && plausible.length > 1

  return {
    query: queryProfile,
    ambiguous,
    candidates: ambiguous ? plausible : candidates,
    keptCandidateCount: ambiguous ? plausible.length : candidates.length
  }
}

export const routeKnowledgeQuery = rankConceptsForQuery

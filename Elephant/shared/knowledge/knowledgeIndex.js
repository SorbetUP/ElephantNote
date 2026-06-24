export const KNOWLEDGE_INDEX_VERSION = 1

const STOP_WORDS = new Set([
  'a',
  'about',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'de',
  'des',
  'du',
  'en',
  'et',
  'for',
  'from',
  'in',
  'is',
  'la',
  'le',
  'les',
  'of',
  'on',
  'or',
  'the',
  'to',
  'un',
  'une',
  'with'
])

const normalizePath = (value = '') => String(value || '')
  .replaceAll(String.fromCharCode(92), '/')
  .split('/')
  .filter((part) => part && part !== '.')
  .join('/')

export const normalizeKnowledgeText = (text = '') => String(text || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

export const createStableKnowledgeHash = (value = '') => {
  const normalized = normalizeKnowledgeText(value)
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

export const tokenizeKnowledgeText = (text = '') => {
  const tokens = normalizeKnowledgeText(text).match(/[a-z0-9][a-z0-9_-]{1,}/g) || []
  return tokens.filter((token) => token && !STOP_WORDS.has(token))
}

const markdownToPlainText = (markdown = '') => String(markdown || '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/[#>*_\-[\]()`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const stripFrontmatter = (markdown = '') => String(markdown || '').replace(/^---\r?\n[\s\S]*?^---\s*$/m, '')

const headingText = (line = '') => String(line || '')
  .replace(/^#{1,6}\s+/, '')
  .replace(/\s+#+\s*$/, '')
  .trim()

const splitWords = (text = '') => String(text || '').split(/\s+/).filter(Boolean)

const pushSectionChunks = ({ chunks, section, documentPath, maxWords, language, updatedAt }) => {
  const plainText = markdownToPlainText(section.lines.join('\n'))
  const words = splitWords(plainText)
  if (!words.length) return

  for (let start = 0; start < words.length; start += maxWords) {
    const text = words.slice(start, start + maxWords).join(' ')
    const chunkIndex = chunks.length
    const textHash = createStableKnowledgeHash(text)
    const headingPath = [...section.headingPath]
    const lexicalTerms = [...new Set(tokenizeKnowledgeText(`${headingPath.join(' ')} ${text}`))]
    chunks.push({
      id: `chunk:${createStableKnowledgeHash(`${documentPath}:${chunkIndex}:${textHash}`)}`,
      documentPath,
      relativePath: documentPath,
      chunkIndex,
      headingPath,
      text,
      content: text,
      textHash,
      tokenCount: tokenizeKnowledgeText(text).length,
      wordCount: words.slice(start, start + maxWords).length,
      language,
      createdAt: updatedAt,
      updatedAt,
      lexicalTerms,
      entities: [],
      citations: []
    })
  }
}

export const createKnowledgeChunksFromMarkdown = ({
  relativePath = '',
  markdown = '',
  maxWords = 140,
  language = 'unknown',
  updatedAt = new Date().toISOString()
} = {}) => {
  const documentPath = normalizePath(relativePath)
  const boundedMaxWords = Math.max(24, Math.min(512, Number(maxWords) || 140))
  const lines = stripFrontmatter(markdown).split(/\r?\n/)
  const chunks = []
  const headingStack = []
  let section = { headingPath: [], lines: [] }

  const flush = () => {
    pushSectionChunks({
      chunks,
      section,
      documentPath,
      maxWords: boundedMaxWords,
      language,
      updatedAt
    })
  }

  for (const line of lines) {
    const heading = String(line || '').match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flush()
      const level = heading[1].length
      headingStack[level - 1] = headingText(line)
      headingStack.length = level
      section = { headingPath: headingStack.filter(Boolean), lines: [] }
      continue
    }
    section.lines.push(line)
  }
  flush()

  return chunks
}

export const createKnowledgeDocumentRecord = ({ relativePath = '', markdown = '', metadata = {} } = {}) => {
  const documentPath = normalizePath(relativePath)
  const title = metadata.title || documentPath.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled'
  const updatedAt = metadata.updatedAt || new Date().toISOString()
  const chunks = createKnowledgeChunksFromMarkdown({
    relativePath: documentPath,
    markdown,
    maxWords: metadata.maxWords,
    language: metadata.language || 'unknown',
    updatedAt
  })

  return {
    id: `document:${createStableKnowledgeHash(documentPath)}`,
    relativePath: documentPath,
    path: documentPath,
    title,
    updatedAt,
    chunkIds: chunks.map((chunk) => chunk.id),
    chunkCount: chunks.length,
    textHash: createStableKnowledgeHash(markdown)
  }
}

export const createKnowledgeChunkIndex = (documents = [], { now = new Date() } = {}) => {
  const generatedAt = now.toISOString()
  const documentRecords = []
  const chunks = []

  for (const document of documents) {
    const relativePath = normalizePath(document.relativePath || document.path || '')
    if (!relativePath) continue
    const markdown = String(document.markdown || document.content || document.body || '')
    const metadata = {
      title: document.title,
      updatedAt: document.updatedAt || generatedAt,
      language: document.language || 'unknown',
      maxWords: document.maxWords
    }
    const documentChunks = createKnowledgeChunksFromMarkdown({
      relativePath,
      markdown,
      maxWords: metadata.maxWords,
      language: metadata.language,
      updatedAt: metadata.updatedAt
    })
    chunks.push(...documentChunks)
    documentRecords.push({
      ...createKnowledgeDocumentRecord({ relativePath, markdown, metadata }),
      chunkIds: documentChunks.map((chunk) => chunk.id),
      chunkCount: documentChunks.length
    })
  }

  return {
    version: KNOWLEDGE_INDEX_VERSION,
    generatedAt,
    documents: documentRecords,
    chunks,
    stats: {
      documents: documentRecords.length,
      chunks: chunks.length,
      lexicalTerms: new Set(chunks.flatMap((chunk) => chunk.lexicalTerms)).size
    }
  }
}

const toTermSet = (values = []) => new Set(values.flatMap((value) => tokenizeKnowledgeText(value)))

export const createConceptProfile = ({
  id = '',
  title = '',
  aliases = [],
  positiveTerms = [],
  negativeTerms = [],
  positivePrototypeTexts = [],
  negativePrototypeTexts = []
} = {}) => ({
  id: id || `concept:${createStableKnowledgeHash(title)}`,
  title,
  aliases: aliases.map((alias) => String(alias || '').trim()).filter(Boolean),
  positiveTerms: [...toTermSet([title, ...aliases, ...positiveTerms, ...positivePrototypeTexts])],
  negativeTerms: [...toTermSet([...negativeTerms, ...negativePrototypeTexts])],
  positivePrototypeTexts,
  negativePrototypeTexts
})

const overlapScore = (chunkTerms, conceptTerms, weight) => {
  if (!conceptTerms.length) return 0
  const conceptSet = new Set(conceptTerms)
  const matches = [...chunkTerms].filter((term) => conceptSet.has(term))
  return Math.min(weight, matches.length * (weight / Math.max(2, Math.min(8, conceptTerms.length))))
}

export const scoreChunkAgainstConcept = (chunk = {}, concept = {}) => {
  const chunkTerms = new Set(chunk.lexicalTerms || tokenizeKnowledgeText(chunk.text || chunk.content || ''))
  const normalizedText = normalizeKnowledgeText(`${chunk.headingPath?.join(' ') || ''} ${chunk.text || chunk.content || ''}`)
  const aliasHit = (concept.aliases || []).some((alias) => normalizedText.includes(normalizeKnowledgeText(alias))) ? 0.2 : 0
  const lexical = overlapScore(chunkTerms, concept.positiveTerms || [], 0.7)
  const negativeEvidence = overlapScore(chunkTerms, concept.negativeTerms || [], 0.45)
  const score = Math.max(0, Math.min(1, lexical + aliasHit - negativeEvidence))
  const confidence = Math.max(0, Math.min(1, Math.abs(lexical + aliasHit - negativeEvidence)))

  return {
    chunkId: chunk.id || '',
    wikiId: concept.id || '',
    conceptId: concept.id || '',
    score: Number(score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    signals: {
      embedding: 0,
      lexical: Number(lexical.toFixed(4)),
      entity: 0,
      graph: 0,
      citation: 0,
      recency: 0,
      negativeEvidence: Number(negativeEvidence.toFixed(4)),
      alias: Number(aliasHit.toFixed(4))
    },
    explanation: score > 0
      ? `Matched ${concept.title || concept.id || 'concept'} through lexical/prototype evidence.`
      : `No strong evidence for ${concept.title || concept.id || 'concept'}.`
  }
}

export const rankConceptsForChunk = (chunk = {}, concepts = []) => concepts
  .map((concept) => ({ concept, membership: scoreChunkAgainstConcept(chunk, concept) }))
  .sort((a, b) => b.membership.score - a.membership.score || String(a.concept.title || '').localeCompare(String(b.concept.title || '')))

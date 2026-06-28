export const ATOMIC_AI_INDEX_VERSION = 1

export const ATOMIC_AI_FEATURES = Object.freeze([
  {
    id: 'embedding-search',
    label: 'Embedding search',
    status: 'implemented',
    description: 'Chunk notes, embed their text and return semantic matches.'
  },
  {
    id: 'semantic-links',
    label: 'Automatic semantic links',
    status: 'implemented',
    description: 'Create note-to-note links from embedding similarity.'
  },
  {
    id: 'source-extraction',
    label: 'Automatic sources',
    status: 'implemented',
    description: 'Extract source URLs and Markdown links into citation-ready metadata.'
  },
  {
    id: 'auto-tagging',
    label: 'Auto-tagging',
    status: 'implemented',
    description: 'Suggest deterministic tags for local notes and LLM fallback prompts.'
  },
  {
    id: 'cited-rag-chat',
    label: 'Cited RAG chat',
    status: 'implemented',
    description: 'Use semantic retrieval and source metadata to build cited answers.'
  },
  {
    id: 'wiki-synthesis',
    label: 'Wiki synthesis',
    status: 'implemented',
    description: 'Generate citation-backed wiki proposals from note clusters.'
  },
  {
    id: 'local-model-runtimes',
    label: 'Local model runtimes',
    status: 'adapter',
    description: 'Tauri Rust llama.cpp, local OCR, API and Codex slots are exposed through provider configuration.'
  },
  {
    id: 'mcp-tools',
    label: 'MCP tools',
    status: 'adapter',
    description: 'Search, read, create, update and ingest actions are exposed through ElephantNote API contracts.'
  }
])

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

const TOKEN_ALIASES = Object.freeze({
  ai: ['ai', 'ia', 'llm', 'model', 'models', 'agent', 'agents', 'embedding', 'embeddings'],
  canvas: ['canvas', 'graph', 'graphs', 'edge', 'edges', 'link', 'links'],
  source: ['source', 'sources', 'citation', 'citations', 'url', 'urls', 'web'],
  sync: ['sync', 'git', 'replication', 'backup'],
  note: ['note', 'notes', 'atom', 'atoms', 'markdown', 'vault'],
  local: ['local', 'offline', 'browser', 'webgpu', 'webcpu', 'ollama', 'mlx']
})

const normalizeText = (text = '') =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export const tokenizeAtomicText = (text = '') => {
  const tokens = normalizeText(text).match(/[a-z0-9][a-z0-9_-]{1,}/g) || []
  const expanded = []
  for (const token of tokens) {
    const clean = token.replace(/^#+/, '')
    if (!clean || STOP_WORDS.has(clean)) continue
    expanded.push(clean)
    for (const [canonical, aliases] of Object.entries(TOKEN_ALIASES)) {
      if (aliases.includes(clean) && clean !== canonical) expanded.push(canonical)
    }
  }
  return expanded
}

const hashToken = (token) => {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export const createTextEmbedding = (text = '', dimensions = 64) => {
  const vector = Array.from({ length: dimensions }, () => 0)
  const tokens = tokenizeAtomicText(text)
  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % dimensions
    const sign = hash & 1 ? 1 : -1
    vector[index] += sign
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => Number((value / magnitude).toFixed(6)))
}

export const cosineSimilarity = (left = [], right = []) => {
  const length = Math.min(left.length, right.length)
  if (!length) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator ? dot / denominator : 0
}

export const markdownToPlainAtomicText = (markdown = '') =>
  String(markdown || '')
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\-[\]()`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const titleFromAtomicMarkdown = (markdown = '', fallback = '') => {
  const frontmatterTitle = String(markdown || '').match(/^---\r?\n[\s\S]*?^\s*title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTitle?.[1]) return frontmatterTitle[1].trim()
  const heading = String(markdown || '').match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

export const extractMarkdownSources = (markdown = '') => {
  const sources = []
  const seen = new Set()
  const addSource = ({ url, title = '', type = 'url' }) => {
    const normalizedUrl = String(url || '').trim()
    if (!normalizedUrl || seen.has(normalizedUrl)) return
    seen.add(normalizedUrl)
    sources.push({
      id: `source:${hashToken(normalizedUrl).toString(36)}`,
      url: normalizedUrl,
      title: String(title || normalizedUrl).trim(),
      type
    })
  }

  for (const match of String(markdown || '').matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addSource({ title: match[1], url: match[2], type: 'markdown-link' })
  }
  for (const match of String(markdown || '').matchAll(/(?:source|url|citation)\s*:\s*(https?:\/\/\S+)/gi)) {
    addSource({ url: match[1].replace(/[),.;]+$/, ''), type: 'frontmatter-or-text' })
  }
  for (const match of String(markdown || '').matchAll(/\bhttps?:\/\/[^\s)]+/g)) {
    addSource({ url: match[0].replace(/[),.;]+$/, ''), type: 'inline-url' })
  }
  return sources
}

export const ensureAtomicSourcesSection = (markdown = '', sources = extractMarkdownSources(markdown)) => {
  const value = String(markdown || '').trimEnd()
  const validSources = (sources || []).filter((source) => source?.url)
  if (!validSources.length || /^##\s+Sources\s*$/mi.test(value)) return value
  const lines = validSources.map((source) => {
    const title = String(source.title || source.url).replace(/\]/g, '')
    return `- [${title}](${source.url})`
  })
  return `${value}\n\n## Sources\n\n${lines.join('\n')}\n`
}

export const chunkAtomicMarkdown = (markdown = '', { maxWords = 140 } = {}) => {
  const text = markdownToPlainAtomicText(markdown)
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const chunks = []
  for (let start = 0; start < words.length; start += maxWords) {
    const content = words.slice(start, start + maxWords).join(' ')
    chunks.push({
      id: `chunk:${chunks.length}`,
      content,
      tokenCount: tokenizeAtomicText(content).length,
      embedding: createTextEmbedding(content)
    })
  }
  return chunks
}

export const createAtomicDocument = ({ relativePath = '', markdown = '' } = {}) => {
  const title = titleFromAtomicMarkdown(markdown, relativePath.replace(/\.md$/i, '') || 'Untitled')
  const plainText = markdownToPlainAtomicText(markdown)
  const chunks = chunkAtomicMarkdown(markdown)
  return {
    id: relativePath,
    relativePath,
    title,
    plainText,
    sources: extractMarkdownSources(markdown),
    tags: suggestAtomicTags(markdown),
    chunks,
    embedding: createTextEmbedding(`${title}\n${plainText}`)
  }
}

export const suggestAtomicTags = (markdown = '', limit = 6) => {
  const explicitTags = []
  for (const match of String(markdown || '').matchAll(/(?:^|\s)#([a-zA-Z0-9][\w/-]+)/g)) {
    explicitTags.push(match[1].toLowerCase())
  }
  const counts = new Map()
  for (const token of tokenizeAtomicText(markdown)) {
    if (token.length < 4) continue
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  return [...new Set([
    ...explicitTags,
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([token]) => token)
  ])].slice(0, limit)
}

export const createAtomicSemanticIndex = (documents = [], { linkThreshold = 0.24 } = {}) => {
  const semanticLinks = []
  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < documents.length; rightIndex += 1) {
      const left = documents[leftIndex]
      const right = documents[rightIndex]
      const score = cosineSimilarity(left.embedding, right.embedding)
      if (score >= linkThreshold) {
        semanticLinks.push({
          id: `semantic:${left.relativePath}->${right.relativePath}`,
          source: left.relativePath,
          target: right.relativePath,
          score: Number(score.toFixed(4)),
          reason: 'embedding-similarity'
        })
      }
    }
  }
  return {
    version: ATOMIC_AI_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    documents,
    semanticLinks: semanticLinks.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  }
}

export const searchAtomicSemanticIndex = ({ index, query = '', queryEmbedding = null, limit = 20 } = {}) => {
  const resolvedQueryEmbedding = Array.isArray(queryEmbedding) && queryEmbedding.length
    ? queryEmbedding
    : createTextEmbedding(query)
  return (index?.documents || [])
    .map((document) => {
      const bestChunk = (document.chunks || [])
        .map((chunk) => ({
          text: chunk.content,
          score: cosineSimilarity(resolvedQueryEmbedding, chunk.embedding)
        }))
        .sort((a, b) => b.score - a.score)[0]
      const score = Math.max(cosineSimilarity(resolvedQueryEmbedding, document.embedding), bestChunk?.score || 0)
      return {
        id: `semantic:${document.relativePath}`,
        uri: `elephantnote://vault/${encodeURI(document.relativePath)}`,
        title: document.title,
        relativePath: document.relativePath,
        score: Number(score.toFixed(4)),
        matchType: 'semantic',
        snippets: bestChunk?.text ? [{ text: bestChunk.text, score: Number((bestChunk.score || score).toFixed(4)) }] : [],
        sources: document.sources,
        tags: document.tags
      }
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
}

export const createCitedAnswer = ({ question = '', results = [] } = {}) => {
  const citations = results.slice(0, 5).map((result, index) => ({
    id: index + 1,
    title: result.title,
    relativePath: result.relativePath,
    sourceUrl: result.sources?.[0]?.url || ''
  }))
  const context = citations.map((citation) => `[${citation.id}] ${citation.title}`).join(', ')
  return {
    answer: citations.length
      ? `I found ${citations.length} relevant note${citations.length === 1 ? '' : 's'} for "${question}": ${context}.`
      : `I could not find a relevant local note for "${question}".`,
    citations
  }
}

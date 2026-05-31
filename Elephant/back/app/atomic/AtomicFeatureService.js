import fs from 'fs-extra'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

import { getSearchService } from '../search/searchIpc'
import { markdownToSearchText } from '../search/markdownToSearchText'
import { isIgnoredPath, isMarkdownFile } from '../search/pathSafety'

const execFileAsync = promisify(execFile)

const DEFAULT_GRAPH_OPTIONS = Object.freeze({
  semanticThreshold: 0.28,
  lexicalThreshold: 0.18,
  maxLexicalLinksPerNote: 4,
  maxNotes: 400
})

const PROVIDERS = Object.freeze([
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',
    defaultEndpoint: 'http://127.0.0.1:11434',
    chatPath: '/api/chat',
    embeddingPath: '/api/embeddings',
    supportsModelPull: true,
    notes: 'Best local default. Pull models with ollama pull and keep notes private.'
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    type: 'local',
    defaultEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    supportsModelPull: false,
    notes: 'Use the OpenAI-compatible local server from LM Studio.'
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible API',
    type: 'remote-or-local',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    supportsModelPull: false,
    notes: 'Works with OpenRouter, OpenAI-compatible gateways, self-hosted vLLM, llama.cpp server, etc.'
  },
  {
    id: 'codex-compatible',
    name: 'Codex / OpenAI subscription bridge',
    type: 'remote',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    supportsModelPull: false,
    notes: 'Use an OpenAI-compatible endpoint and API key. The app stores only the config you enter.'
  }
])

const RECOMMENDED_MODELS = Object.freeze([
  { id: 'nomic-embed-text', name: 'Nomic Embed Text', provider: 'ollama', purpose: 'embedding', pull: 'nomic-embed-text', size: '274 MB' },
  { id: 'mxbai-embed-large', name: 'MxBAI Embed Large', provider: 'ollama', purpose: 'embedding', pull: 'mxbai-embed-large', size: '669 MB' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', provider: 'ollama', purpose: 'chat', pull: 'llama3.2:3b', size: '2 GB' },
  { id: 'qwen2.5:7b', name: 'Qwen2.5 7B', provider: 'ollama', purpose: 'wiki', pull: 'qwen2.5:7b', size: '4.7 GB' },
  { id: 'qwen2.5-coder:7b', name: 'Qwen2.5 Coder 7B', provider: 'ollama', purpose: 'code', pull: 'qwen2.5-coder:7b', size: '4.7 GB' },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', provider: 'ollama', purpose: 'summary', pull: 'llama3.1:8b', size: '4.9 GB' }
])

const normalizeSlashPath = (value = '') => String(value || '').split(path.sep).join('/')

const normalizeVaultRoot = (vaultRoot = '') => path.resolve(String(vaultRoot || ''))

const assertVaultRoot = (vaultRoot) => {
  const root = normalizeVaultRoot(vaultRoot)
  if (!root || root === path.parse(root).root) {
    throw new Error('A valid ElephantNote vault root is required.')
  }
  return root
}

const toRelativePath = (vaultRoot, absolutePath) => normalizeSlashPath(path.relative(vaultRoot, absolutePath))

const slugify = (value = '') => String(value || 'topic')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'topic'

const safeFilename = (value = 'Untitled') => String(value || 'Untitled')
  .replace(/[\\/]/g, '-')
  .replace(/[<>:"|?*]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 90) || 'Untitled'

const nextAvailableName = async(directory, baseName) => {
  const ext = path.extname(baseName)
  const stem = path.basename(baseName, ext)
  let candidate = baseName
  let counter = 2
  while (await fs.pathExists(path.join(directory, candidate))) {
    candidate = `${stem} ${counter}${ext}`
    counter += 1
  }
  return candidate
}

const parseFrontmatter = (markdown = '') => {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return {}
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!parts) continue
    const key = parts[1]
    let value = parts[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value.slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      meta[key] = value
    }
  }
  return meta
}

const stripFrontmatter = (markdown = '') => String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

const extractTitle = (markdown, relativePath, meta = {}) => {
  if (meta.title) return String(meta.title)
  const heading = stripFrontmatter(markdown).match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return path.basename(relativePath, path.extname(relativePath))
}

const extractTags = (meta = {}, markdown = '') => {
  const tags = new Set()
  const frontmatterTags = Array.isArray(meta.tags) ? meta.tags : []
  for (const tag of frontmatterTags) {
    const normalized = String(tag || '').trim().replace(/^#/, '')
    if (normalized) tags.add(normalized)
  }
  for (const match of String(markdown || '').matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]{2,64})/gu)) {
    tags.add(match[1])
  }
  return [...tags].slice(0, 24)
}

const extractHeadings = (markdown = '') => {
  const headings = []
  const lines = String(markdown || '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue
    headings.push({
      level: match[1].length,
      title: match[2].replace(/[#`*_]/g, '').trim(),
      line: index + 1
    })
  }
  return headings
}

const extractLinks = (markdown = '') => {
  const links = []
  for (const match of String(markdown || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
    links.push({ label: match[1].trim(), type: 'wikilink' })
  }
  for (const match of String(markdown || '').matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/gi)) {
    links.push({ label: decodeURIComponent(match[1]).replace(/#.*/, ''), type: 'markdown' })
  }
  return links
}

const STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'plus', 'moins', 'comme', 'donc', 'mais', 'cette', 'cela', 'fait', 'faire', 'etre', 'être',
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'will', 'your', 'note', 'notes', 'todo', 'done'
])

const tokenize = (text = '') => String(text || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
  .split(/\s+/)
  .map((word) => word.trim())
  .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))

const topTerms = (text = '', limit = 12) => {
  const counts = new Map()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}

const jaccard = (left = [], right = []) => {
  const a = new Set(left)
  const b = new Set(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const value of a) {
    if (b.has(value)) intersection += 1
  }
  return intersection / (a.size + b.size - intersection)
}

const summarizeLocally = (text = '', maxLength = 340) => {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'No readable content yet.'
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  const summary = sentences.slice(0, 3).join(' ') || cleaned
  return summary.length > maxLength ? `${summary.slice(0, maxLength - 1).trim()}…` : summary
}

const extractActionItems = (markdown = '') => String(markdown || '')
  .split(/\r?\n/)
  .map((line, index) => ({ line: index + 1, text: line.trim() }))
  .filter((item) => /^[-*]\s+\[[ xX]\]/.test(item.text) || /\b(todo|à faire|a faire|fixme|next|prochaine étape)\b/i.test(item.text))
  .slice(0, 12)

const resolveRelativeReference = (reference = '', knownPaths = new Set()) => {
  const normalized = normalizeSlashPath(reference).replace(/^\.\//, '')
  if (!normalized) return ''
  const direct = normalized.endsWith('.md') ? normalized : `${normalized}.md`
  if (knownPaths.has(direct)) return direct
  const basename = path.basename(direct).toLowerCase()
  for (const candidate of knownPaths) {
    if (path.basename(candidate).toLowerCase() === basename) return candidate
  }
  return ''
}

const mapEdgeKey = (source, target) => [source, target].sort().join('::')

const addEdge = (edges, edge) => {
  if (!edge?.source || !edge?.target || edge.source === edge.target) return
  const key = mapEdgeKey(edge.source, edge.target)
  const current = edges.get(key)
  if (!current || Number(edge.weight || 0) > Number(current.weight || 0)) {
    edges.set(key, {
      id: key,
      source: edge.source,
      target: edge.target,
      type: edge.type || 'related',
      reason: edge.reason || edge.type || 'related',
      weight: Math.max(0, Math.min(1, Number(edge.weight || 0.1)))
    })
  }
}

const normalizeProviderConfig = (config = {}) => ({
  enabled: Boolean(config.enabled),
  provider: String(config.provider || config.preset || 'ollama').trim(),
  endpoint: String(config.endpoint || '').trim(),
  model: String(config.model || '').trim(),
  apiKey: String(config.apiKey || '').trim(),
  temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.2
})

const getProviderDefaultEndpoint = (providerId) => PROVIDERS.find((provider) => provider.id === providerId)?.defaultEndpoint || ''

const callChatProvider = async(messages = [], rawConfig = {}) => {
  const config = normalizeProviderConfig(rawConfig)
  if (!config.enabled || !config.model) return ''

  if (config.provider === 'ollama') {
    const base = (config.endpoint || getProviderDefaultEndpoint('ollama')).replace(/\/+$/, '')
    const url = base.endsWith('/api/chat') ? base : `${base}/api/chat`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: { temperature: config.temperature }
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || `Ollama returned HTTP ${response.status}.`)
    return data?.message?.content || data?.response || ''
  }

  const endpoint = config.endpoint || getProviderDefaultEndpoint(config.provider) || getProviderDefaultEndpoint('openai-compatible')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      stream: false
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `AI endpoint returned HTTP ${response.status}.`)
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || ''
}

const parseMarkdownNote = async(vaultRoot, absolutePath) => {
  const markdown = await fs.readFile(absolutePath, 'utf8')
  const relativePath = toRelativePath(vaultRoot, absolutePath)
  const stats = await fs.stat(absolutePath).catch(() => null)
  const meta = parseFrontmatter(markdown)
  const searchable = markdownToSearchText(markdown)
  const title = extractTitle(markdown, relativePath, meta)
  const tags = extractTags(meta, markdown)
  const folder = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath)
  const terms = topTerms(`${title} ${tags.join(' ')} ${searchable}`, 16)

  return {
    id: relativePath,
    path: relativePath,
    relativePath,
    absolutePath,
    title,
    folder,
    tags,
    headings: extractHeadings(markdown),
    links: extractLinks(markdown),
    summary: summarizeLocally(searchable),
    keyTerms: terms,
    actionItems: extractActionItems(markdown),
    text: searchable,
    markdown,
    updatedAt: stats?.mtime?.toISOString?.() || meta.updatedAt || '',
    createdAt: meta.createdAt || ''
  }
}

const createCitation = (note, index = 0) => ({
  id: note.path,
  index: index + 1,
  title: note.title,
  path: note.path,
  snippet: note.summary,
  tags: note.tags || []
})

export class AtomicFeatureService {
  constructor({ executor = execFileAsync } = {}) {
    this.executor = executor
  }

  providers() {
    return {
      providers: PROVIDERS,
      recommendedModels: RECOMMENDED_MODELS
    }
  }

  async overview({ vaultRoot, windowId = null } = {}) {
    const root = assertVaultRoot(vaultRoot)
    const notes = await this.listNotes(root)
    const status = await getSearchService().getStatus(windowId).catch(() => null)
    return {
      vaultRoot: root,
      notes: notes.length,
      providers: PROVIDERS,
      recommendedModels: RECOMMENDED_MODELS,
      capabilities: [
        'semantic-search',
        'hybrid-search',
        'cited-rag',
        'automatic-wiki',
        'automatic-summaries',
        'note-structure',
        'semantic-graph',
        'ollama-model-download',
        'lm-studio-openai-compatible',
        'codex-compatible-provider'
      ],
      searchStatus: status
    }
  }

  async listNotes(vaultRoot) {
    const root = assertVaultRoot(vaultRoot)
    const files = []
    const walk = async(directory) => {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name)
        const relativePath = toRelativePath(root, absolutePath)
        if (isIgnoredPath(relativePath)) continue
        if (entry.isDirectory()) {
          await walk(absolutePath)
        } else if (entry.isFile() && isMarkdownFile(absolutePath)) {
          files.push(absolutePath)
        }
      }
    }
    await walk(root)
    const notes = []
    for (const file of files.slice(0, DEFAULT_GRAPH_OPTIONS.maxNotes)) {
      try {
        notes.push(await parseMarkdownNote(root, file))
      } catch {
        // Ignore unreadable notes and keep the workspace usable.
      }
    }
    return notes.sort((a, b) => a.path.localeCompare(b.path))
  }

  async graph({ vaultRoot, windowId = null, semanticThreshold = DEFAULT_GRAPH_OPTIONS.semanticThreshold, lexicalThreshold = DEFAULT_GRAPH_OPTIONS.lexicalThreshold } = {}) {
    const root = assertVaultRoot(vaultRoot)
    const notes = await this.listNotes(root)
    const byPath = new Map(notes.map((note) => [note.path, note]))
    const knownPaths = new Set(byPath.keys())
    const edges = new Map()

    for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
      const left = notes[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
        const right = notes[rightIndex]
        const sharedTags = left.tags.filter((tag) => right.tags.includes(tag))
        if (sharedTags.length) {
          addEdge(edges, {
            source: left.path,
            target: right.path,
            type: 'tag',
            reason: `#${sharedTags.slice(0, 3).join(' #')}`,
            weight: Math.min(0.95, 0.35 + sharedTags.length * 0.12)
          })
        }
        if (left.folder && left.folder === right.folder) {
          addEdge(edges, {
            source: left.path,
            target: right.path,
            type: 'folder',
            reason: left.folder,
            weight: 0.32
          })
        }
        const lexicalScore = jaccard(left.keyTerms, right.keyTerms)
        if (lexicalScore >= lexicalThreshold) {
          addEdge(edges, {
            source: left.path,
            target: right.path,
            type: 'lexical',
            reason: 'shared meaning keywords',
            weight: Math.min(0.88, lexicalScore + 0.2)
          })
        }
      }
    }

    for (const note of notes) {
      for (const link of note.links) {
        const target = resolveRelativeReference(link.label, knownPaths)
        if (!target || target === note.path) continue
        addEdge(edges, {
          source: note.path,
          target,
          type: 'explicit-link',
          reason: link.type,
          weight: 1
        })
      }
    }

    const inspection = await getSearchService().inspectIndex(windowId).catch(() => null)
    for (const semanticLink of inspection?.semanticLinks || []) {
      if (!byPath.has(semanticLink.source) || !byPath.has(semanticLink.target)) continue
      if (Number(semanticLink.score || 0) < semanticThreshold) continue
      addEdge(edges, {
        source: semanticLink.source,
        target: semanticLink.target,
        type: 'semantic',
        reason: 'embedding similarity',
        weight: Math.max(0.1, Math.min(1, Number(semanticLink.score || 0)))
      })
    }

    const clusters = this.buildClusters(notes)
    return {
      generatedAt: new Date().toISOString(),
      vaultRoot: root,
      nodes: notes.map((note) => ({
        id: note.path,
        path: note.path,
        title: note.title,
        folder: note.folder,
        tags: note.tags,
        summary: note.summary,
        headings: note.headings.slice(0, 8),
        keyTerms: note.keyTerms.slice(0, 10),
        updatedAt: note.updatedAt,
        cluster: note.tags[0] || note.folder || 'untagged'
      })),
      edges: [...edges.values()].sort((a, b) => b.weight - a.weight),
      clusters,
      indexPath: inspection?.indexPath || '',
      searchStatus: inspection?.status || null
    }
  }

  buildClusters(notes = []) {
    const clusters = new Map()
    for (const note of notes) {
      const clusterId = note.tags[0] || note.folder || 'untagged'
      const current = clusters.get(clusterId) || {
        id: clusterId,
        label: clusterId,
        noteCount: 0,
        paths: [],
        keyTerms: new Map()
      }
      current.noteCount += 1
      current.paths.push(note.path)
      for (const term of note.keyTerms.slice(0, 8)) {
        current.keyTerms.set(term, (current.keyTerms.get(term) || 0) + 1)
      }
      clusters.set(clusterId, current)
    }
    return [...clusters.values()]
      .map((cluster) => ({
        id: cluster.id,
        label: cluster.label,
        noteCount: cluster.noteCount,
        paths: cluster.paths,
        keyTerms: [...cluster.keyTerms.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([term]) => term)
      }))
      .sort((a, b) => b.noteCount - a.noteCount || a.label.localeCompare(b.label))
  }

  async wiki({ vaultRoot, windowId = null, providerConfig = {} } = {}) {
    const graph = await this.graph({ vaultRoot, windowId })
    const byPath = new Map(graph.nodes.map((node) => [node.path, node]))
    const groups = new Map()

    const addToGroup = (topic, node) => {
      if (!topic || !node) return
      const current = groups.get(topic) || []
      current.push(node)
      groups.set(topic, current)
    }

    for (const node of graph.nodes) {
      for (const tag of node.tags || []) addToGroup(`#${tag}`, node)
      if (node.folder) addToGroup(node.folder, node)
      if (!(node.tags || []).length && !node.folder) addToGroup('Untagged knowledge', node)
    }

    for (const cluster of graph.clusters) {
      for (const pathname of cluster.paths || []) addToGroup(cluster.label, byPath.get(pathname))
    }

    const records = []
    const seen = new Set()
    for (const [topic, nodes] of groups.entries()) {
      const uniqueNodes = [...new Map(nodes.map((node) => [node.path, node])).values()]
      if (uniqueNodes.length < 2 && graph.nodes.length > 2) continue
      const id = `atomic-wiki-${slugify(topic)}`
      if (seen.has(id)) continue
      seen.add(id)
      const citations = uniqueNodes
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, 8)
        .map(createCitation)
      const keyTerms = topTerms(citations.map((citation) => `${citation.title} ${citation.snippet} ${(citation.tags || []).join(' ')}`).join('\n'), 12)
      let summary = `This topic connects ${citations.length} local note${citations.length === 1 ? '' : 's'} around ${keyTerms.slice(0, 5).join(', ') || topic}.`
      const localContext = citations.map((citation) => `[${citation.index}] ${citation.title} (${citation.path})\n${citation.snippet}`).join('\n\n')
      try {
        const aiSummary = await callChatProvider([
          { role: 'system', content: 'You create concise private wiki summaries. Use only the provided cited local notes. Keep citation markers like [1].' },
          { role: 'user', content: `Topic: ${topic}\n\nCited local notes:\n${localContext}\n\nWrite a 5 sentence synthesis with citations.` }
        ], providerConfig)
        if (aiSummary) summary = aiSummary.trim()
      } catch {
        // Local deterministic fallback is intentionally used when the provider is unavailable.
      }

      records.push({
        id,
        topic,
        title: topic.replace(/^#/, ''),
        summary,
        keyTerms,
        citations,
        status: 'proposed',
        confidence: Math.min(1, 0.35 + citations.length * 0.08),
        suggestedMarkdown: this.renderWikiMarkdown({ topic, summary, citations, keyTerms })
      })
    }

    return {
      generatedAt: new Date().toISOString(),
      records: records.sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title)).slice(0, 40)
    }
  }

  renderWikiMarkdown({ topic, summary, citations, keyTerms }) {
    return `---\ntitle: "${String(topic || 'Wiki').replace(/"/g, '\\"')}"\ntype: "wiki"\ntags: ["wiki", "atomic"]\ncreatedAt: "${new Date().toISOString()}"\nupdatedAt: "${new Date().toISOString()}"\n---\n\n# ${topic}\n\n${summary}\n\n## Key terms\n\n${(keyTerms || []).map((term) => `- ${term}`).join('\n') || '- No key terms yet.'}\n\n## Citations\n\n${(citations || []).map((citation) => `- [${citation.index}] [[${citation.path}]] — ${citation.title}`).join('\n') || '- No citations.'}\n`
  }

  async createWikiPage({ vaultRoot, record = {}, windowId = null } = {}) {
    const root = assertVaultRoot(vaultRoot)
    const wikiDir = path.join(root, 'Wiki')
    await fs.ensureDir(wikiDir)
    const title = record.title || record.topic || 'Atomic Wiki Page'
    const filename = await nextAvailableName(wikiDir, `${safeFilename(title)}.md`)
    const fullPath = path.join(wikiDir, filename)
    const markdown = record.suggestedMarkdown || this.renderWikiMarkdown({
      topic: title,
      summary: record.summary || '',
      citations: record.citations || [],
      keyTerms: record.keyTerms || []
    })
    await fs.writeFile(fullPath, markdown, 'utf8')
    await getSearchService().indexFile(fullPath, windowId).catch(() => {})
    return {
      path: toRelativePath(root, fullPath),
      fullPath,
      title: path.basename(filename, '.md')
    }
  }

  async summarize({ vaultRoot, relativePath, providerConfig = {} } = {}) {
    const root = assertVaultRoot(vaultRoot)
    const fullPath = path.resolve(root, String(relativePath || ''))
    if (!fullPath.startsWith(root + path.sep)) throw new Error('Note path is outside the active vault.')
    const note = await parseMarkdownNote(root, fullPath)
    let summary = note.summary
    try {
      const aiSummary = await callChatProvider([
        { role: 'system', content: 'Summarize this local markdown note. Keep it factual, structured, and concise.' },
        { role: 'user', content: note.markdown.slice(0, 18000) }
      ], providerConfig)
      if (aiSummary) summary = aiSummary.trim()
    } catch {
      // Fallback summary already exists.
    }
    return {
      relativePath: note.path,
      title: note.title,
      summary,
      citations: [createCitation(note, 0)],
      keyTerms: note.keyTerms,
      headings: note.headings,
      actionItems: note.actionItems
    }
  }

  async structure({ vaultRoot, relativePath, providerConfig = {} } = {}) {
    const root = assertVaultRoot(vaultRoot)
    const fullPath = path.resolve(root, String(relativePath || ''))
    if (!fullPath.startsWith(root + path.sep)) throw new Error('Note path is outside the active vault.')
    const note = await parseMarkdownNote(root, fullPath)
    const suggestedTags = [...new Set([...note.tags, ...note.keyTerms.slice(0, 6)])].slice(0, 10)
    let restructuring = ''
    try {
      restructuring = await callChatProvider([
        { role: 'system', content: 'Suggest a better markdown structure for this note. Return headings and bullet sections only. Do not invent facts.' },
        { role: 'user', content: note.markdown.slice(0, 18000) }
      ], providerConfig)
    } catch {
      restructuring = ''
    }
    return {
      relativePath: note.path,
      title: note.title,
      outline: note.headings,
      suggestedTags,
      keyTerms: note.keyTerms,
      actionItems: note.actionItems,
      restructuring: restructuring || this.renderLocalStructure(note)
    }
  }

  renderLocalStructure(note) {
    const sections = note.headings.length
      ? note.headings.map((heading) => `${'  '.repeat(Math.max(0, heading.level - 1))}- ${heading.title}`).join('\n')
      : '- Summary\n- Details\n- Next actions\n- References'
    const tags = note.keyTerms.slice(0, 6).map((term) => `#${term}`).join(' ')
    return `Suggested outline:\n${sections}\n\nSuggested tags: ${tags || 'none'}\n\nSummary:\n${note.summary}`
  }

  async pullModel({ id, provider = 'ollama' } = {}) {
    const model = RECOMMENDED_MODELS.find((item) => item.id === id || item.pull === id) || { id, pull: id, provider }
    if (!model.id && !model.pull) throw new Error('Model id is required.')
    if ((model.provider || provider) !== 'ollama') {
      return {
        id: model.id,
        provider: model.provider || provider,
        downloaded: false,
        message: 'Automatic download is only available for Ollama models. Configure this provider manually in Settings > AI.'
      }
    }
    await this.executor('ollama', ['pull', model.pull || model.id], { timeout: 30 * 60 * 1000 })
    return {
      id: model.id,
      provider: 'ollama',
      downloaded: true,
      message: `${model.name || model.id} downloaded with Ollama.`
    }
  }

  async listLocalModels() {
    try {
      const result = await this.executor('ollama', ['list'])
      return {
        provider: 'ollama',
        available: true,
        raw: result.stdout || '',
        models: String(result.stdout || '')
          .split(/\r?\n/)
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, id, size, ...modifiedParts] = line.split(/\s{2,}/)
            return { name: name || '', id: id || '', size: size || '', modified: modifiedParts.join(' ') }
          })
          .filter((model) => model.name)
      }
    } catch (error) {
      return {
        provider: 'ollama',
        available: false,
        models: [],
        raw: '',
        error: error?.message || 'Ollama is not available.'
      }
    }
  }
}

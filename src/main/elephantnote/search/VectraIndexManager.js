import fs from 'fs-extra'
import path from 'path'
import { LocalDocumentIndex, TransformersEmbeddings } from 'vectra'
import {
  assertPathInsideVault,
  isIgnoredPath,
  isMarkdownFile
} from './pathSafety'
import { markdownToSearchText } from './markdownToSearchText'
import { SEARCH_MATCH_TYPES, SEARCH_MODES } from './searchTypes'

const DEFAULT_SEARCH_CONFIG = Object.freeze({
  backend: 'vectra',
  embeddingProvider: 'transformers-local',
  model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  allowRemoteProviders: false,
  requireApiKey: false,
  uploadNotes: false,
  indexFolderName: '.elephantnote/search/vectra'
})

const toVaultRelativePath = (vaultRoot, absolutePath) => {
  const relativePath = path.relative(vaultRoot, absolutePath)
  return relativePath.split(path.sep).join('/')
}

const toElephantNoteUri = (relativePath) => {
  return `elephantnote://vault/${encodeURI(relativePath)}`
}

const fromElephantNoteUri = (uri) => {
  const prefix = 'elephantnote://vault/'
  if (!uri || !uri.startsWith(prefix)) return ''
  return decodeURI(uri.slice(prefix.length))
}

const getSearchIndexPath = (vaultRoot) => {
  return path.join(vaultRoot, DEFAULT_SEARCH_CONFIG.indexFolderName)
}

const ensureIndexFolder = async(vaultRoot) => {
  await fs.ensureDir(getSearchIndexPath(vaultRoot))
}

const createEmbeddings = async() => {
  return TransformersEmbeddings.create({
    model: DEFAULT_SEARCH_CONFIG.model,
    device: 'cpu',
    dtype: 'q8',
    normalize: true,
    pooling: 'mean'
  })
}

const scoreMatchType = (resultScore, keywordHit) => {
  if (keywordHit && resultScore >= 0.55) return SEARCH_MATCH_TYPES.HYBRID
  if (keywordHit) return SEARCH_MATCH_TYPES.KEYWORD
  return SEARCH_MATCH_TYPES.SEMANTIC
}

const queryOptionsForMode = (mode, useBm25 = true, maxDocuments = 20) => {
  return {
    maxDocuments,
    maxChunks: Math.max(10, maxDocuments * 2),
    isBm25: useBm25 && mode !== SEARCH_MODES.SEMANTIC
  }
}

export class VectraIndexManager {
  constructor() {
    this._vaultRoot = ''
    this._index = null
    this._embeddings = null
    this._ready = false
    this._initializing = null
  }

  async init(vaultRoot) {
    const root = path.resolve(vaultRoot || '')
    if (!root) {
      throw new Error('A vault root is required.')
    }

    if (this._ready && this._vaultRoot === root && this._index) {
      return
    }

    if (this._initializing) {
      await this._initializing
      return
    }

    this._vaultRoot = root
    this._initializing = this._initialize(root)

    try {
      await this._initializing
    } finally {
      this._initializing = null
    }
  }

  async _initialize(vaultRoot) {
    await ensureIndexFolder(vaultRoot)

    if (!this._embeddings) {
      this._embeddings = await createEmbeddings()
    }

    const index = new LocalDocumentIndex({
      folderPath: getSearchIndexPath(vaultRoot),
      embeddings: this._embeddings,
      tokenizer: this._embeddings.getTokenizer(),
      chunkingConfig: {
        chunkSize: 400,
        overlap: 40
      }
    })

    if (!(await index.isIndexCreated())) {
      await index.createIndex({
        version: 1,
        metadata_config: {
          indexed: ['relativePath', 'title', 'absolutePath', 'type', 'mtime']
        }
      })
    }

    this._index = index
    this._ready = true
  }

  async isReady() {
    return this._ready && !!this._index
  }

  async _ensureReady(vaultRoot) {
    const root = path.resolve(vaultRoot || this._vaultRoot || '')
    if (!root) {
      throw new Error('A vault root is required.')
    }

    if (!this._index || this._vaultRoot !== root || !this._ready) {
      await this.init(root)
    }
  }

  async upsertMarkdownFile({ vaultRoot, absolutePath }) {
    await this._ensureReady(vaultRoot)
    assertPathInsideVault(vaultRoot, absolutePath)

    const relativePath = toVaultRelativePath(vaultRoot, absolutePath)
    if (isIgnoredPath(relativePath) || !isMarkdownFile(absolutePath)) return

    const markdown = await fs.readFile(absolutePath, 'utf8')
    const text = markdownToSearchText(markdown)
    if (!text) return

    const stats = await fs.stat(absolutePath)
    const uri = toElephantNoteUri(relativePath)
    const title = path.basename(absolutePath, path.extname(absolutePath))

    await this._index.upsertDocument(uri, text, 'md', {
      relativePath,
      absolutePath,
      title,
      type: 'md',
      mtime: stats.mtime.toISOString()
    })
  }

  async deleteMarkdownFile({ vaultRoot, absolutePath }) {
    await this._ensureReady(vaultRoot)
    assertPathInsideVault(vaultRoot, absolutePath)

    const relativePath = toVaultRelativePath(vaultRoot, absolutePath)
    if (isIgnoredPath(relativePath) || !isMarkdownFile(absolutePath)) return

    await this._index.deleteDocument(toElephantNoteUri(relativePath))
  }

  async query({ query, mode, limit = 20 }) {
    if (!this._index || !this._ready) return []

    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) return []

    const maxDocuments = Math.max(1, Math.min(50, Number(limit) || 20))
    let results = []
    const tryQuery = async(useBm25) => {
      return this._index.queryDocuments(
        normalizedQuery,
        queryOptionsForMode(mode, useBm25, maxDocuments)
      )
    }

    try {
      results = await tryQuery(true)
    } catch (error) {
      const errorMessage = String(error?.message || error || '')
      if (errorMessage.toLowerCase().includes('document collection is too small')) {
        results = await tryQuery(false)
      } else {
        throw error
      }
    }

    const loweredQuery = normalizedQuery.toLowerCase()
    const mapped = []

    for (const result of results) {
      const metadata = await result.loadMetadata().catch(() => ({}))
      const relativePath = metadata.relativePath || fromElephantNoteUri(result.uri)
      const title = metadata.title || path.basename(relativePath || result.uri, path.extname(relativePath || result.uri))
      const sectionList = await result.renderSections(160, 3).catch(() => [])
      const snippets = sectionList
        .map((section) => ({
          text: String(section.text || '').trim(),
          score: section.score
        }))
        .filter((section) => section.text)

      const keywordHit =
        loweredQuery &&
        (title.toLowerCase().includes(loweredQuery) ||
          (relativePath || '').toLowerCase().includes(loweredQuery) ||
          snippets.some((section) => section.text.toLowerCase().includes(loweredQuery)))

      mapped.push({
        id: result.id,
        uri: result.uri,
        title,
        relativePath,
        score: result.score,
        matchType: scoreMatchType(result.score, keywordHit),
        snippets
      })
    }

    if (mode === SEARCH_MODES.EXACT) {
      mapped.sort((a, b) => {
        const aExact = [a.title, a.relativePath, ...a.snippets.map((s) => s.text)]
          .some((text) => text.toLowerCase().includes(loweredQuery))
        const bExact = [b.title, b.relativePath, ...b.snippets.map((s) => s.text)]
          .some((text) => text.toLowerCase().includes(loweredQuery))
        if (aExact !== bExact) return aExact ? -1 : 1
        return b.score - a.score
      })
    }

    return mapped.slice(0, maxDocuments)
  }

  async rebuild(vaultRoot) {
    await this.clear(vaultRoot)
    await this.init(vaultRoot)
  }

  async clear(vaultRoot) {
    const root = path.resolve(vaultRoot || this._vaultRoot || '')
    if (!root) return

    const indexFolder = getSearchIndexPath(root)
    await fs.remove(indexFolder)
    if (this._vaultRoot === root) {
      this._index = null
      this._ready = false
    }
  }

  async listDocuments() {
    if (!this._index || !this._ready) return []
    return this._index.listDocuments()
  }

  async inspectDocuments() {
    if (!this._index || !this._ready) return []

    const documents = await this._index.listDocuments()
    const inspected = []

    for (const document of documents) {
      const metadata = await document.loadMetadata().catch(() => ({}))
      const relativePath = metadata.relativePath || fromElephantNoteUri(document.uri)
      const folder = path.dirname(relativePath || '')
      inspected.push({
        id: document.id,
        uri: document.uri,
        title: metadata.title || path.basename(relativePath || document.uri, path.extname(relativePath || document.uri)),
        relativePath,
        folder: folder === '.' ? '' : folder,
        type: metadata.type || 'md',
        mtime: metadata.mtime || ''
      })
    }

    return inspected.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  }

  getSearchIndexPath(vaultRoot = this._vaultRoot) {
    return getSearchIndexPath(vaultRoot)
  }
}

export { DEFAULT_SEARCH_CONFIG, toElephantNoteUri, fromElephantNoteUri }

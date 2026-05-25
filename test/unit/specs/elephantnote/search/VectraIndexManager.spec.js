import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { vi } from 'vitest'

const upsertCalls = []
const deleteCalls = []
const queryCalls = []
let queryShouldFallback = false
let includeDocumentWithoutPath = false
let listDocumentsAsEmpty = false

vi.mock('vectra', () => {
  class FakeLocalDocumentIndex {
    constructor(config) {
      this.config = config
      this._created = false
    }

    async isIndexCreated() {
      return this._created
    }

    async createIndex(config) {
      this._created = true
      this.createIndexConfig = config
    }

    async upsertDocument(uri, text, docType, metadata) {
      upsertCalls.push({ uri, text, docType, metadata })
    }

    async deleteDocument(uri) {
      deleteCalls.push(uri)
    }

    async queryDocuments(query, options) {
      queryCalls.push({ query, options })
      if (queryShouldFallback && options?.isBm25) {
        throw new Error('winkBM25S: document collection is too small for consolidation; add more docs!')
      }
      return [
        {
          id: 'doc-1',
          uri: 'elephantnote://vault/Research/world-model.md',
          score: 0.9,
          loadMetadata: async() => ({
            relativePath: 'Research/world-model.md',
            title: 'World Model'
          }),
          renderSections: async() => [{ text: 'latent memory and semantic retrieval', score: 0.9 }]
        }
      ]
    }

    async listDocuments() {
      if (listDocumentsAsEmpty) return []
      const documents = upsertCalls.map((call, index) => ({
        id: `doc-${index + 1}`,
        uri: call.uri,
        loadMetadata: async() => call.metadata
      }))
      if (includeDocumentWithoutPath) {
        documents.push({
          id: 'doc-without-path',
          uri: '',
          loadMetadata: async() => ({})
        })
      }
      return documents
    }

    async listItems() {
      return upsertCalls.map((call, index) => ({
        id: `chunk-${index + 1}`,
        metadata: {
          documentId: `doc-${index + 1}`,
          ...call.metadata
        },
        vector: index % 2 === 0 ? [1, 0, 0] : [0.92, 0.08, 0]
      }))
    }
  }

  return {
    LocalDocumentIndex: FakeLocalDocumentIndex,
    TransformersEmbeddings: {
      create: vi.fn(async() => ({
        getTokenizer: () => ({
          encode: (text) => String(text).split(/\s+/).filter(Boolean),
          decode: (tokens) => tokens.join(' ')
        }),
        model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
      }))
    }
  }
})

const { VectraIndexManager, DEFAULT_SEARCH_CONFIG } = await import(
  'main_renderer/elephantnote/search/VectraIndexManager'
)

describe('VectraIndexManager', () => {
  const root = path.join(os.tmpdir(), 'elephantnote-vectra-test')
  const notePath = path.join(root, 'Research', 'world-model.md')

  beforeEach(async() => {
    upsertCalls.length = 0
    deleteCalls.length = 0
    queryCalls.length = 0
    queryShouldFallback = false
    includeDocumentWithoutPath = false
    listDocumentsAsEmpty = false
    await fs.remove(root)
    await fs.ensureDir(path.dirname(notePath))
    await fs.writeFile(notePath, '# World Model\n\nlatent memory and semantic retrieval', 'utf8')
  })

  afterEach(async() => {
    await fs.remove(root)
  })

  it('initializes and creates the search folder', async() => {
    const manager = new VectraIndexManager()
    await manager.init(root)
    expect(await fs.pathExists(path.join(root, DEFAULT_SEARCH_CONFIG.indexFolderName))).to.equal(true)
  })

  it('upserts, queries and deletes markdown documents', async() => {
    const manager = new VectraIndexManager()
    await manager.init(root)

    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })
    expect(upsertCalls).to.have.length(1)
    expect(upsertCalls[0].uri).to.equal('elephantnote://vault/Research/world-model.md')

    const results = await manager.query({ query: 'memory', mode: 'smart', limit: 10 })
    expect(results).to.have.length(1)
    expect(results[0].relativePath).to.equal('Research/world-model.md')

    await manager.deleteMarkdownFile({ vaultRoot: root, absolutePath: notePath })
    expect(deleteCalls).to.deep.equal(['elephantnote://vault/Research/world-model.md'])
  })

  it('inspects indexed document metadata without reading note content', async() => {
    const manager = new VectraIndexManager()
    await manager.init(root)
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })

    const documents = await manager.inspectDocuments()
    expect(documents).to.have.length(1)
    expect(documents[0]).to.include({
      uri: 'elephantnote://vault/Research/world-model.md',
      title: 'world-model',
      relativePath: 'Research/world-model.md',
      folder: 'Research',
      type: 'md'
    })
  })

  it('skips malformed indexed documents during inspection', async() => {
    includeDocumentWithoutPath = true
    const manager = new VectraIndexManager()
    await manager.init(root)
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })

    const documents = await manager.inspectDocuments()

    expect(documents).to.have.length(1)
    expect(documents[0].relativePath).to.equal('Research/world-model.md')
  })

  it('falls back to indexed chunk metadata during inspection', async() => {
    listDocumentsAsEmpty = true
    const manager = new VectraIndexManager()
    await manager.init(root)
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })

    const documents = await manager.inspectDocuments()

    expect(documents).to.have.length(1)
    expect(documents[0]).to.include({
      uri: 'elephantnote://vault/Research/world-model.md',
      title: 'world-model',
      relativePath: 'Research/world-model.md',
      folder: 'Research',
      type: 'md'
    })
  })

  it('builds semantic links from indexed chunk vectors', async() => {
    const secondNotePath = path.join(root, 'Research', 'retrieval.md')
    await fs.writeFile(secondNotePath, '# Retrieval\n\nembeddings and related memory', 'utf8')

    const manager = new VectraIndexManager()
    await manager.init(root)
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: secondNotePath })

    const links = await manager.inspectSemanticLinks({ threshold: 0.5 })

    expect(links).to.have.length(1)
    expect(links[0]).to.include({
      source: 'Research/world-model.md',
      target: 'Research/retrieval.md',
      type: 'semantic'
    })
    expect(links[0].score).to.be.greaterThan(0.9)
  })

  it('falls back to semantic-only search when bm25 cannot consolidate a tiny collection', async() => {
    queryShouldFallback = true

    const manager = new VectraIndexManager()
    await manager.init(root)
    await manager.upsertMarkdownFile({ vaultRoot: root, absolutePath: notePath })

    const results = await manager.query({ query: 'memory', mode: 'smart', limit: 10 })
    expect(results).to.have.length(1)
    expect(queryCalls).to.have.length(2)
    expect(queryCalls[0].options.isBm25).to.equal(true)
    expect(queryCalls[1].options.isBm25).to.equal(false)
  })
})

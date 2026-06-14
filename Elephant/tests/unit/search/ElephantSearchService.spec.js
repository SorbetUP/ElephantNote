import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

const { ElephantSearchService } = await import('main_renderer/elephantnote/search/ElephantSearchService')

describe('ElephantSearchService exact local search', () => {
  it('searches small vaults without loading the semantic model', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-search-service-'))
    try {
      await fs.writeFile(path.join(root, 'One.md'), '# Alpha\n\nLocal keyword only', 'utf8')
      const service = new ElephantSearchService()
      await service.registerWindowVault(1, root)

      const results = await service.search({ query: 'keyword', mode: 'exact', limit: 5 }, 1)

      expect(results).toHaveLength(1)
      expect(results[0].relativePath).toBe('One.md')
    } finally {
      await fs.remove(root)
    }
  })

  it('inspects embedding documents, sources and semantic links', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-search-inspect-'))
    try {
      await fs.ensureDir(path.join(root, 'Project'))
      await fs.writeFile(
        path.join(root, 'Project', 'Plan.md'),
        '# Plan\n\nLocal AI embeddings connect notes into an embedding graph. Source: https://example.com/plan',
        'utf8'
      )
      await fs.writeFile(
        path.join(root, 'Project', 'Graph.md'),
        '# Graph\n\nLocal AI embedding links create semantic graph edges between connected notes.',
        'utf8'
      )
      const service = new ElephantSearchService()
      await service.registerWindowVault(2, root)

      const inspection = await service.inspectIndex(2)

      expect(inspection.indexPath).toBe('')
      expect(inspection.documents).toHaveLength(2)
      expect(inspection.documents[0]).toMatchObject({
        relativePath: 'Project/Graph.md',
        chunkCount: 1
      })
      expect(inspection.folders).toEqual([])
      expect(inspection.documents.some((document) => document.sourceCount === 1)).toBe(true)
      expect(inspection.semanticLinks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          reason: 'embedding-similarity'
        })
      ]))
      expect(inspection.features).toMatchObject({
        embeddings: true,
        semanticLinks: true,
        automaticSources: true
      })
    } finally {
      await fs.remove(root)
    }
  })

  it('uses local embeddings for semantic search before external models are configured', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-meaning-search-'))
    try {
      await fs.writeFile(
        path.join(root, 'Agents.md'),
        '---\ntitle: "Agents"\ntags: ["ai"]\n---\n\n# Agents\n\nConnect notes to local models and tool calls.',
        'utf8'
      )
      const service = new ElephantSearchService()
      await service.registerWindowVault(3, root)

      const results = await service.search({ query: 'llm', mode: 'semantic', limit: 5 }, 3)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        relativePath: 'Agents.md',
        matchType: 'semantic'
      })
    } finally {
      await fs.remove(root)
    }
  })

  it('uses the configured runtime embedding provider for semantic search', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-runtime-embedding-search-'))
    try {
      await fs.writeFile(
        path.join(root, 'LocalAI.md'),
        '# Local AI\n\nnode-llama-cpp embeddings power semantic note search.',
        'utf8'
      )
      const embeddedTexts = []
      const service = new ElephantSearchService({
        embeddingProvider: {
          source: 'node-llama-cpp',
          embedText: async(text) => {
            embeddedTexts.push(text)
            return String(text).toLowerCase().includes('node-llama-cpp') ||
              String(text).toLowerCase().includes('llama')
              ? [1, 0, 0]
              : [0, 1, 0]
          }
        }
      })
      await service.registerWindowVault(4, root)

      const results = await service.search({ query: 'llama embeddings', mode: 'semantic', limit: 5 }, 4)
      const inspection = await service.inspectIndex(4)

      expect(results[0]).toMatchObject({
        relativePath: 'LocalAI.md',
        matchType: 'semantic'
      })
      expect(inspection.features).toMatchObject({
        embeddingSource: 'node-llama-cpp'
      })
      expect(embeddedTexts.some((text) => text.includes('node llama cpp embeddings'))).toBe(true)
      expect(embeddedTexts).toContain('llama embeddings')
    } finally {
      await fs.remove(root)
    }
  })
})

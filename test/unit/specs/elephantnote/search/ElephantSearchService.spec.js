import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

const createEmbeddings = vi.fn(async() => {
  throw new Error('semantic model should not load for exact search')
})

vi.mock('vectra', () => ({
  LocalDocumentIndex: class {},
  TransformersEmbeddings: {
    create: createEmbeddings
  }
}))

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
      expect(createEmbeddings).not.toHaveBeenCalled()
    } finally {
      await fs.remove(root)
    }
  })
})

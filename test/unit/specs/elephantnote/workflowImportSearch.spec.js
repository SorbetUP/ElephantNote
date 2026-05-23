import { describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const createEmbeddings = vi.fn(async() => {
  throw new Error('semantic model should not load during workflow exact search')
})

vi.mock('vectra', () => ({
  LocalDocumentIndex: class {},
  TransformersEmbeddings: {
    create: createEmbeddings
  }
}))

const { importGoogleKeepExport } = await import('main_renderer/elephantnote/googleKeepImport')
const { ElephantSearchService } = await import('main_renderer/elephantnote/search/ElephantSearchService')

describe('ElephantNote import-to-search workflow', () => {
  it('imports a real Google Keep zip and finds the note through local search', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-workflow-'))
    const keepRoot = path.join(root, 'Takeout', 'Keep')
    const vaultRoot = path.join(root, 'vault')
    const destinationPath = path.join(vaultRoot, 'Imported')
    const zipPath = path.join(root, 'keep-export.zip')

    try {
      await fs.ensureDir(keepRoot)
      await fs.writeJson(path.join(keepRoot, 'agent-note.json'), {
        title: 'Agent workflow note',
        textContent: 'Vector pipeline should read this imported phrase.',
        createdTimestampUsec: 1700000000000000,
        userEditedTimestampUsec: 1700001000000000
      })
      execFileSync('zip', ['-qr', zipPath, '.'], { cwd: path.join(root, 'Takeout') })

      const imported = await importGoogleKeepExport({ sourcePath: zipPath, destinationPath })
      const service = new ElephantSearchService()
      await service.registerWindowVault(7, vaultRoot)

      const results = await service.search({
        query: 'imported phrase',
        mode: 'exact',
        limit: 5
      }, 7)

      expect(imported.imported).toBe(1)
      expect(results.map((result) => result.relativePath)).toContain('Imported/Agent workflow note.md')
      expect(createEmbeddings).not.toHaveBeenCalled()
    } finally {
      await fs.remove(root)
    }
  })
})

/* @vitest-environment node */

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { build } from '@docmd/core'
import { DocmdConfigWriter } from 'main_renderer/elephantnote/sitePreview/DocmdConfigWriter'
import { DocmdSiteManager } from 'main_renderer/elephantnote/sitePreview/DocmdSiteManager'

describe('docmd build integration', () => {
  let root

  beforeEach(async() => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'en-docmd-build-'))
  })

  afterEach(async() => {
    await fs.remove(root)
  })

  it('builds a static site from a temporary Markdown folder without modifying notes', async() => {
    const sourceFolder = path.join(root, 'Docs')
    const assetsFolder = path.join(sourceFolder, 'assets')
    await fs.ensureDir(assetsFolder)
    await fs.writeFile(path.join(sourceFolder, 'index.md'), '# Home\n\n[Guide](./guide.md)\n\n![Schema](./assets/schema.png)\n', 'utf8')
    await fs.writeFile(path.join(sourceFolder, 'guide.md'), '# Guide\n', 'utf8')
    await fs.writeFile(path.join(assetsFolder, 'schema.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    const originalIndex = await fs.readFile(path.join(sourceFolder, 'index.md'), 'utf8')

    const workspaceDir = path.join(root, '.elephantnote', 'site-previews', 'docs')
    const outputDir = path.join(workspaceDir, 'site')
    const tmpDir = path.join(workspaceDir, 'tmp')
    const { configPath } = await new DocmdConfigWriter().writeConfig({
      title: 'Docs',
      sourceFolder,
      workspaceDir,
      outputDir,
      tmpDir
    })

    await build(configPath, { isDev: false, offline: false, quiet: true })

    expect(await fs.pathExists(path.join(outputDir, 'index.html'))).to.equal(true)
    expect(await fs.pathExists(path.join(outputDir, 'guide', 'index.html'))).to.equal(true)
    expect(await fs.readFile(path.join(sourceFolder, 'index.md'), 'utf8')).to.equal(originalIndex)
  })

  it('creates a preview home page when the folder has notes but no index.md', async() => {
    const vaultRoot = path.join(root, 'Vault')
    const sourceFolder = path.join(vaultRoot, 'Notes')
    await fs.ensureDir(sourceFolder)
    await fs.writeFile(path.join(sourceFolder, 'Untitled.md'), '# Untitled\n\nBody', 'utf8')

    const info = await new DocmdSiteManager().preparePreview({
      vaultRoot,
      folderPath: sourceFolder
    })

    expect(info.status).not.to.equal('error')
    const indexPath = path.join(info.outputDir, 'index.html')
    expect(await fs.pathExists(indexPath)).to.equal(true)
    expect(await fs.readFile(indexPath, 'utf8')).to.contain('Untitled')
  })
})

/* @vitest-environment node */

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { DocmdConfigWriter } from 'main_renderer/elephantnote/sitePreview/DocmdConfigWriter'

describe('DocmdConfigWriter', () => {
  let root

  beforeEach(async() => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'en-docmd-config-'))
  })

  afterEach(async() => {
    await fs.remove(root)
  })

  it('writes docmd.config.json with source, output, tmp and search config', async() => {
    const sourceFolder = path.join(root, 'Docs')
    const workspaceDir = path.join(root, '.elephantnote', 'site-previews', 'docs')
    const outputDir = path.join(workspaceDir, 'site')
    const tmpDir = path.join(workspaceDir, 'tmp')
    await fs.ensureDir(sourceFolder)

    const { configPath, config } = await new DocmdConfigWriter().writeConfig({
      title: 'Docs',
      sourceFolder,
      workspaceDir,
      outputDir,
      tmpDir
    })

    expect(await fs.pathExists(configPath)).to.equal(true)
    const saved = await fs.readJson(configPath)
    expect(saved.title).to.equal('Docs')
    expect(saved.src).to.equal(sourceFolder)
    expect(saved.out).to.equal(outputDir)
    expect(saved.tmp).to.equal(tmpDir)
    expect(saved.url).to.equal('http://127.0.0.1/')
    expect(saved.layout.optionsMenu.components.search).to.equal(true)
    expect(config.autoTitleFromH1).to.equal(true)
  })
})

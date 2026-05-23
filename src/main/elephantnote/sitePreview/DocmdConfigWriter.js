import fs from 'fs-extra'
import path from 'path'

export class DocmdConfigWriter {
  async writeConfig({ title = 'ElephantNote', sourceFolder, workspaceDir, outputDir, tmpDir }) {
    if (!sourceFolder || !workspaceDir || !outputDir || !tmpDir) {
      throw new Error('A source folder and workspace paths are required.')
    }

    await fs.ensureDir(workspaceDir)
    await fs.ensureDir(outputDir)
    await fs.ensureDir(tmpDir)

    const configPath = path.join(workspaceDir, 'docmd.config.json')
    const config = {
      title,
      src: path.resolve(sourceFolder),
      out: path.resolve(outputDir),
      tmp: path.resolve(tmpDir),
      url: 'http://127.0.0.1/',
      base: '/',
      theme: {
        name: 'default'
      },
      layout: {
        optionsMenu: {
          position: 'header',
          components: {
            search: true
          }
        }
      },
      minify: false,
      autoTitleFromH1: true,
      copyCode: true,
      pageNavigation: true
    }

    await fs.writeJson(configPath, config, { spaces: 2 })
    return { configPath, config }
  }
}

import fs from 'fs-extra'
import path from 'path'
import { createId, WORKSPACE_DIR } from '../core'
import { DocmdConfigWriter } from './DocmdConfigWriter'
import { SITE_BUILD_MODE, SITE_PREVIEW_STATUS } from './siteTypes'
import { assertPathInsideVault, isValidSiteSourceFolder } from './pathSafety'

const PREVIEWS_DIR = 'site-previews'
const BUILDS_DIR = 'site-builds'

const createSiteId = (vaultRoot, folderPath) => {
  const relativePath = path.relative(path.resolve(vaultRoot), path.resolve(folderPath))
  return createId(relativePath || path.basename(folderPath) || 'site')
}

const writeLog = async(siteDir, message) => {
  const logsDir = path.join(siteDir, 'logs')
  await fs.ensureDir(logsDir)
  await fs.appendFile(path.join(logsDir, 'site-preview.log'), `${new Date().toISOString()} ${message}\n`, 'utf8')
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const collectHtmlPages = async(outputDir) => {
  const pages = []

  const walk = async(directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        const relativePath = path.relative(outputDir, fullPath).split(path.sep).join('/')
        if (relativePath !== 'index.html') pages.push(relativePath)
      }
    }
  }

  await walk(outputDir)
  return pages.sort((a, b) => a.localeCompare(b))
}

const ensureRootIndex = async({ outputDir, title }) => {
  const rootIndex = path.join(outputDir, 'index.html')
  if (await fs.pathExists(rootIndex)) return true

  const pages = await collectHtmlPages(outputDir)
  if (!pages.length) return false

  const links = pages.map((page) => {
    const label = page.replace(/\/index\.html$/i, '').replace(/\.html$/i, '') || page
    return `<li><a href="./${escapeHtml(page)}">${escapeHtml(label)}</a></li>`
  }).join('\n')

  await fs.writeFile(rootIndex, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || 'ElephantNote')}</title>
  <style>
    body { margin: 0; font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f8fafc; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 24px; font-size: 34px; line-height: 1.1; }
    ul { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
    a { display: block; border: 1px solid #d1d5db; border-radius: 8px; padding: 14px 16px; color: #1d4ed8; background: #fff; text-decoration: none; }
    a:hover { border-color: #93c5fd; background: #eff6ff; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title || 'ElephantNote')}</h1>
    <ul>
${links}
    </ul>
  </main>
</body>
</html>
`, 'utf8')
  return true
}

export class DocmdSiteManager {
  constructor({ configWriter = new DocmdConfigWriter() } = {}) {
    this.configWriter = configWriter
  }

  getSitePaths({ vaultRoot, folderPath, mode }) {
    const id = createSiteId(vaultRoot, folderPath)
    const baseDirName = mode === SITE_BUILD_MODE.STATIC_EXPORT ? BUILDS_DIR : PREVIEWS_DIR
    const siteRoot = path.join(vaultRoot, WORKSPACE_DIR, baseDirName, id)
    return {
      id,
      siteRoot,
      outputDir: path.join(siteRoot, 'site'),
      tmpDir: path.join(siteRoot, 'tmp')
    }
  }

  async preparePreview(request) {
    return this.buildWithMode({ ...request, mode: SITE_BUILD_MODE.PREVIEW })
  }

  async buildStaticSite(request) {
    return this.buildWithMode({ ...request, mode: SITE_BUILD_MODE.STATIC_EXPORT })
  }

  async buildWithMode({ vaultRoot, folderPath, mode }) {
    const sourceFolder = path.resolve(folderPath)
    assertPathInsideVault(vaultRoot, sourceFolder)
    if (!(await isValidSiteSourceFolder(vaultRoot, sourceFolder))) {
      throw new Error('This folder does not contain Markdown notes.')
    }

    const paths = this.getSitePaths({ vaultRoot, folderPath: sourceFolder, mode })
    await fs.remove(paths.tmpDir)
    await fs.remove(paths.outputDir)
    await fs.ensureDir(paths.siteRoot)

    const { configPath } = await this.configWriter.writeConfig({
      title: path.basename(sourceFolder) || 'ElephantNote',
      sourceFolder,
      workspaceDir: paths.siteRoot,
      outputDir: paths.outputDir,
      tmpDir: paths.tmpDir
    })

    const info = {
      id: paths.id,
      vaultRoot: path.resolve(vaultRoot),
      sourceFolder,
      configPath,
      outputDir: paths.outputDir,
      tmpDir: paths.tmpDir,
      status: SITE_PREVIEW_STATUS.BUILDING
    }

    try {
      const { build } = await import('@docmd/core')
      await writeLog(paths.siteRoot, `Building ${mode} from ${sourceFolder}`)
      await build(configPath, {
        isDev: false,
        offline: mode === SITE_BUILD_MODE.STATIC_EXPORT,
        quiet: true
      })
      const hasIndex = await ensureRootIndex({
        outputDir: paths.outputDir,
        title: path.basename(sourceFolder) || 'ElephantNote'
      })
      if (!hasIndex) {
        throw new Error('Website build did not produce any HTML pages.')
      }
      await writeLog(paths.siteRoot, `Build complete: ${paths.outputDir}`)
      return {
        ...info,
        status: mode === SITE_BUILD_MODE.PREVIEW ? SITE_PREVIEW_STATUS.SERVING : SITE_PREVIEW_STATUS.READY
      }
    } catch (err) {
      await writeLog(paths.siteRoot, `Build failed: ${err.stack || err.message || err}`)
      return {
        ...info,
        status: SITE_PREVIEW_STATUS.ERROR,
        error: 'Website preview failed. See logs for details.'
      }
    }
  }

  async cleanPreview(siteId, vaultRoot) {
    if (!siteId || !vaultRoot) return
    const previewRoot = path.join(vaultRoot, WORKSPACE_DIR, PREVIEWS_DIR)
    const target = path.join(previewRoot, siteId)
    assertPathInsideVault(previewRoot, target)
    await fs.remove(target)
  }

  async cleanAllPreviews(vaultRoot, olderThanMs = 7 * 24 * 60 * 60 * 1000) {
    const previewRoot = path.join(vaultRoot, WORKSPACE_DIR, PREVIEWS_DIR)
    const entries = await fs.readdir(previewRoot, { withFileTypes: true }).catch(() => [])
    const cutoff = Date.now() - olderThanMs

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(previewRoot, entry.name)
      const stats = await fs.stat(fullPath).catch(() => null)
      if (stats && stats.mtimeMs < cutoff) {
        await fs.remove(fullPath)
      }
    }
  }
}

import { shell } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { ElephantSiteManager } from './ElephantSiteManager'
import { StaticSiteServer } from './StaticSiteServer'
import { SITE_PREVIEW_STATUS } from './siteTypes'

export class SitePreviewService {
  constructor({ siteManager = new ElephantSiteManager() } = {}) {
    this.siteManager = siteManager
    this.previews = new Map()
  }

  async previewFolder({ vaultRoot, folderPath }) {
    const info = await this.siteManager.preparePreview({ vaultRoot, folderPath, mode: 'preview' })
    if (info.status === SITE_PREVIEW_STATUS.ERROR) {
      this.previews.set(info.id, info)
      return info
    }

    const existing = this.previews.get(info.id)
    await existing?.server?.stop()

    if (!(await fs.pathExists(path.join(info.outputDir, 'index.html')))) {
      const errorInfo = {
        ...info,
        status: SITE_PREVIEW_STATUS.ERROR,
        error: 'Website preview failed because no home page was generated.'
      }
      this.previews.set(info.id, errorInfo)
      return errorInfo
    }

    const server = new StaticSiteServer()
    const { port, url } = await server.start(info.outputDir)
    const readyInfo = {
      ...info,
      port,
      url,
      status: SITE_PREVIEW_STATUS.READY
    }
    this.previews.set(info.id, { ...readyInfo, server })
    return readyInfo
  }

  async buildFolder({ vaultRoot, folderPath }) {
    return this.siteManager.buildStaticSite({ vaultRoot, folderPath, mode: 'static-export' })
  }

  async stopPreview(siteId) {
    const preview = this.previews.get(siteId)
    if (!preview) return null
    await preview.server?.stop()
    const stopped = {
      ...preview,
      server: undefined,
      status: SITE_PREVIEW_STATUS.STOPPED
    }
    this.previews.set(siteId, stopped)
    return stopped
  }

  async getStatus(siteId) {
    const preview = this.previews.get(siteId)
    if (!preview) return null
    const { server, ...info } = preview
    return info
  }

  async openExternal(url) {
    if (typeof url !== 'string' || !url.startsWith('http://127.0.0.1:')) {
      throw new Error('Only local preview URLs can be opened.')
    }
    return shell.openExternal(url)
  }
}

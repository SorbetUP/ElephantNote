import { RcloneManager } from './RcloneManager.js'
import { buildBisyncArgs } from './rcloneArgs.js'
import { createRcloneExecutor } from './rcloneNodeRunner.js'

const createDefaultRclone = () => new RcloneManager({ executor: createRcloneExecutor() })

export class RcloneVaultEngine {
  constructor({ cwd = '', rclone = createDefaultRclone() } = {}) {
    this.cwd = cwd
    this.rclone = rclone
    this.running = false
    this.lastError = ''
    this.lastRunAt = ''
    this.remotePath = ''
  }

  setCwd(cwd) {
    this.cwd = cwd || ''
  }

  status() {
    return {
      cwd: this.cwd,
      running: this.running,
      remotePath: this.remotePath,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      rclone: this.rclone.status()
    }
  }

  async run({ remotePath = this.remotePath } = {}) {
    this.remotePath = remotePath || this.remotePath
    if (!this.cwd) throw new Error('Rclone sync requires an active vault path.')
    if (!this.remotePath) throw new Error('Rclone sync requires a remote path.')
    this.running = true
    try {
      await this.rclone.run(buildBisyncArgs({ localPath: this.cwd, remotePath: this.remotePath }), { cwd: this.cwd })
      this.lastRunAt = new Date().toISOString()
      this.lastError = ''
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Rclone sync failed.'
      throw error
    } finally {
      this.running = false
    }
  }
}

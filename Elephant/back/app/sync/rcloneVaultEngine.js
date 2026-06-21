import { RcloneManager } from './RcloneManager.js'
import { buildBisyncArgs } from './rcloneArgs.js'
import { createRcloneExecutor } from './rcloneNodeRunner.js'

const createDefaultRclone = () => new RcloneManager({ executor: createRcloneExecutor() })
const nowIso = () => new Date().toISOString()

const createQueueItem = ({ operation, payload = {} } = {}) => ({
  id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  operation: String(operation || '').trim(),
  payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
  status: 'queued',
  createdAt: nowIso(),
  updatedAt: nowIso(),
  error: ''
})

export class RcloneVaultEngine {
  constructor({ cwd = '', rclone = createDefaultRclone() } = {}) {
    this.cwd = cwd
    this.rclone = rclone
    this.queue = []
    this.history = []
    this.running = false
    this.lastError = ''
    this.lastRunAt = ''
    this.remotePath = ''
  }

  setCwd(cwd) {
    this.cwd = cwd || ''
  }

  enqueue(operation) {
    const item = createQueueItem(operation)
    this.queue.push(item)
    return item
  }

  enqueuePlan(payloadByOperation = {}) {
    const operations = Object.keys(payloadByOperation || {}).length
      ? Object.keys(payloadByOperation)
      : ['snapshot']
    return operations.map((operation) => this.enqueue({
      operation,
      payload: payloadByOperation?.[operation] || {}
    }))
  }

  status() {
    return {
      cwd: this.cwd,
      running: this.running,
      remotePath: this.remotePath,
      queued: this.queue.filter((item) => item.status === 'queued').length,
      operations: this.queue.slice(-20),
      history: this.history.slice(-50),
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      rclone: this.rclone.status()
    }
  }

  async run(payload = {}) {
    if (this.running) return this.status()
    if (Object.keys(payload || {}).length) this.enqueuePlan(payload)
    this.running = true
    try {
      for (const item of this.queue.filter((entry) => entry.status === 'queued')) {
        await this.runQueueItem(item)
      }
      this.lastRunAt = nowIso()
      return this.status()
    } finally {
      this.running = false
    }
  }

  async runQueueItem(item) {
    item.status = 'running'
    item.updatedAt = nowIso()
    try {
      if (item.operation === 'init') {
        if (item.payload.remotePath) this.remotePath = item.payload.remotePath
      } else if (['snapshot', 'pull', 'push', 'sync'].includes(item.operation)) {
        await this.sync(item.payload)
      }
      item.status = 'done'
      item.updatedAt = nowIso()
      this.history.push({ ...item })
      return item
    } catch (error) {
      item.status = 'error'
      item.error = error?.message || 'Sync operation failed.'
      item.updatedAt = nowIso()
      this.history.push({ ...item })
      throw error
    }
  }

  async sync({ remotePath = this.remotePath } = {}) {
    this.remotePath = remotePath || this.remotePath
    if (!this.cwd) throw new Error('Rclone sync requires an active vault path.')
    if (!this.remotePath) throw new Error('Rclone sync requires a remote path.')
    try {
      await this.rclone.run(buildBisyncArgs({ localPath: this.cwd, remotePath: this.remotePath }), { cwd: this.cwd })
      this.lastError = ''
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Rclone sync failed.'
      throw error
    }
  }
}

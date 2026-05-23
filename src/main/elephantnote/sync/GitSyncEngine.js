import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const createQueuedOperation = ({ operation, payload = {} }) => ({
  id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  operation,
  payload,
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  error: ''
})

export class GitSyncEngine {
  constructor({ cwd = '', executor = execFileAsync } = {}) {
    this.cwd = cwd
    this.executor = executor
    this.queue = []
    this.running = false
    this.lastRunAt = ''
    this.lastError = ''
  }

  setCwd(cwd) {
    this.cwd = cwd || ''
  }

  enqueue(operation) {
    const item = createQueuedOperation(operation)
    this.queue.push(item)
    return item
  }

  status() {
    return {
      cwd: this.cwd,
      running: this.running,
      queued: this.queue.filter((item) => item.status === 'queued').length,
      operations: this.queue.slice(-20),
      lastRunAt: this.lastRunAt,
      lastError: this.lastError
    }
  }

  async run() {
    if (this.running) return this.status()
    if (!this.cwd) {
      const error = new Error('Git sync requires an active vault path.')
      error.code = 'ELEPHANTNOTE_SYNC_NO_VAULT'
      throw error
    }

    this.running = true
    this.lastError = ''
    try {
      for (const item of this.queue.filter((operation) => operation.status === 'queued')) {
        await this.runOperation(item)
      }
      this.lastRunAt = new Date().toISOString()
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Git sync failed.'
      throw error
    } finally {
      this.running = false
    }
  }

  async runOperation(item) {
    item.status = 'running'
    item.updatedAt = new Date().toISOString()
    try {
      if (item.operation === 'snapshot') {
        await this.git(['status', '--short'])
      } else if (item.operation === 'pull') {
        await this.git(['pull', '--ff-only'])
      } else if (item.operation === 'push') {
        await this.git(['push'])
      } else {
        const error = new Error(`Unknown sync operation: ${item.operation}.`)
        error.code = 'ELEPHANTNOTE_UNKNOWN_SYNC_OPERATION'
        throw error
      }
      item.status = 'done'
      item.updatedAt = new Date().toISOString()
      return item
    } catch (error) {
      item.status = 'error'
      item.error = error?.message || 'Sync operation failed.'
      item.updatedAt = new Date().toISOString()
      throw error
    }
  }

  async git(args) {
    const result = await this.executor('git', args, { cwd: this.cwd })
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    }
  }
}

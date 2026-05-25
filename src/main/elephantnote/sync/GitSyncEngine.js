import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs-extra'
import path from 'path'

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
    this.history = []
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
      history: this.history.slice(-50),
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
        await this.snapshot(item.payload)
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
      await this.recordHistory(item)
      return item
    } catch (error) {
      item.status = 'error'
      item.error = error?.message || 'Sync operation failed.'
      item.updatedAt = new Date().toISOString()
      await this.recordHistory(item)
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

  async snapshot({ message = '' } = {}) {
    const status = await this.git(['status', '--short'])
    if (!status.stdout.trim()) {
      return {
        committed: false,
        message: 'No vault changes to snapshot.'
      }
    }
    await this.git(['add', '-A'])
    const commitMessage = message || `ElephantNote sync snapshot ${new Date().toISOString()}`
    try {
      await this.git(['commit', '-m', commitMessage])
      return {
        committed: true,
        message: commitMessage
      }
    } catch (error) {
      const output = `${error?.stdout || ''}\n${error?.stderr || ''}\n${error?.message || ''}`
      if (/nothing to commit|no changes added/i.test(output)) {
        return {
          committed: false,
          message: 'No vault changes to snapshot.'
        }
      }
      throw error
    }
  }

  async recordHistory(item) {
    const record = {
      id: item.id,
      operation: item.operation,
      status: item.status,
      updatedAt: item.updatedAt,
      error: item.error || ''
    }
    this.history = [...this.history, record].slice(-200)
    await this.persistHistory().catch(() => {})
  }

  async persistHistory() {
    if (!this.cwd) return
    const target = path.join(this.cwd, '.elephantnote', 'sync-log.json')
    await fs.ensureDir(path.dirname(target))
    await fs.writeJson(target, {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: this.history
    }, { spaces: 2 })
  }
}

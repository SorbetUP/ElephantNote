import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import {
  SYNC_CONFIG_FILE,
  SYNC_DEFAULT_REMOTE,
  SYNC_HISTORY_FILE,
  SYNC_METADATA_DIR,
  SYNC_OPERATIONS,
  SYNC_STATUSES,
  createDefaultSyncPlan,
  createSyncConfig,
  createSyncHistoryRecord,
  createSyncQueueItem,
  createSyncStatus,
  createUnknownSyncOperationError
} from '../../Elephant/shared/sync.js'

const execFileAsync = promisify(execFile)

const pathExists = async(target) => fs.access(target).then(() => true, () => false)
const ensureDir = async(target) => fs.mkdir(target, { recursive: true })
const readJson = async(target) => JSON.parse(await fs.readFile(target, 'utf8'))
const outputFile = async(target, content) => {
  await ensureDir(path.dirname(target))
  await fs.writeFile(target, content, 'utf8')
}
const outputJson = async(target, value) => outputFile(target, `${JSON.stringify(value, null, 2)}\n`)

export class WebGitSyncEngine {
  constructor({ cwd, executor = execFileAsync } = {}) {
    this.cwd = cwd
    this.executor = executor
    this.queue = []
    this.history = []
    this.running = false
    this.lastRunAt = ''
    this.lastError = ''
    this.config = null
    this.repository = {}
  }

  enqueue(operation) {
    const item = createSyncQueueItem(operation, new Date(), { strict: false })
    this.queue.push(item)
    return item
  }

  status() {
    return createSyncStatus({
      cwd: this.cwd,
      running: this.running,
      queue: this.queue,
      history: this.history,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      config: this.config,
      repository: this.repository
    })
  }

  async run(payloadByOperation = {}) {
    if (this.running) return this.status()
    for (const operation of createDefaultSyncPlan(payloadByOperation)) this.enqueue(operation)

    this.running = true
    this.lastError = ''
    try {
      for (const item of this.queue.filter((candidate) => candidate.status === SYNC_STATUSES.QUEUED)) {
        await this.runItem(item)
      }
      await this.refresh()
      this.lastRunAt = new Date().toISOString()
      return this.status()
    } catch (error) {
      this.lastError = error.message || 'Sync failed.'
      throw error
    } finally {
      this.running = false
    }
  }

  async runItem(item) {
    item.status = SYNC_STATUSES.RUNNING
    item.updatedAt = new Date().toISOString()
    try {
      if (item.operation === SYNC_OPERATIONS.INIT) await this.init(item.payload)
      else if (item.operation === SYNC_OPERATIONS.SNAPSHOT) await this.snapshot(item.payload)
      else if (item.operation === SYNC_OPERATIONS.PULL) await this.pull(item.payload)
      else if (item.operation === SYNC_OPERATIONS.PUSH) await this.push(item.payload)
      else throw createUnknownSyncOperationError(item.operation)
      item.status = SYNC_STATUSES.DONE
    } catch (error) {
      item.status = SYNC_STATUSES.ERROR
      item.error = error.message || 'Sync operation failed.'
      throw error
    } finally {
      item.updatedAt = new Date().toISOString()
      await this.recordHistory(item)
    }
  }

  async git(args) {
    return this.executor('git', args, { cwd: this.cwd })
  }

  async init({ remote = '', remoteName = SYNC_DEFAULT_REMOTE, branch = '' } = {}) {
    await ensureDir(this.cwd)
    if (!await pathExists(path.join(this.cwd, '.git'))) await this.git(['init'])
    await this.ensureGitIdentity()
    await outputFile(path.join(this.cwd, SYNC_METADATA_DIR, '.gitignore'), `${SYNC_HISTORY_FILE}\n`)

    const configPath = path.join(this.cwd, SYNC_METADATA_DIR, SYNC_CONFIG_FILE)
    this.config = await readJson(configPath).catch(() => null)
    this.config = {
      ...createSyncConfig({
        cwd: this.cwd,
        hostname: os.hostname(),
        remote: remote || this.config?.remote || '',
        remoteName: remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE,
        branch: branch || this.config?.branch || '',
        peers: this.config?.peers || []
      }),
      deviceId: this.config?.deviceId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).deviceId,
      folderId: this.config?.folderId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).folderId
    }

    if (this.config.remote) await this.upsertRemote(this.config.remoteName, this.config.remote)
    await outputJson(configPath, this.config)
  }

  async snapshot({ message = '' } = {}) {
    await this.ensureReady()
    const status = await this.git(['status', '--short'])
    if (!status.stdout.trim()) return { committed: false }
    await this.git(['add', '-A'])
    await this.git(['commit', '-m', message || `ElephantNote sync snapshot ${new Date().toISOString()}`])
    return { committed: true }
  }

  async pull({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    if (!this.config?.remote && !await this.hasRemote(targetRemote)) return
    await this.git(['pull', '--ff-only', targetRemote, branch || this.config?.branch || await this.branch()])
  }

  async push({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    if (!this.config?.remote && !await this.hasRemote(targetRemote)) return
    await this.git(['push', '-u', targetRemote, branch || this.config?.branch || await this.branch()])
  }

  async ensureReady() {
    if (!await pathExists(path.join(this.cwd, '.git'))) {
      await this.init()
    } else if (!this.config) {
      this.config = await readJson(path.join(this.cwd, SYNC_METADATA_DIR, SYNC_CONFIG_FILE)).catch(() => null)
      if (!this.config) await this.init()
    }
  }

  async upsertRemote(remoteName, remote) {
    const exists = await this.hasRemote(remoteName)
    await this.git(exists ? ['remote', 'set-url', remoteName, remote] : ['remote', 'add', remoteName, remote])
  }

  async hasRemote(remoteName) {
    return this.git(['remote', 'get-url', remoteName]).then(() => true, () => false)
  }

  async ensureGitIdentity() {
    const hasName = await this.git(['config', 'user.name']).then((result) => Boolean(result.stdout.trim()), () => false)
    const hasEmail = await this.git(['config', 'user.email']).then((result) => Boolean(result.stdout.trim()), () => false)
    if (!hasName) await this.git(['config', 'user.name', 'ElephantNote Sync'])
    if (!hasEmail) await this.git(['config', 'user.email', 'sync@elephantnote.local'])
  }

  async branch() {
    return (await this.git(['branch', '--show-current']).catch(() => ({ stdout: '' }))).stdout.trim() || 'main'
  }

  async refresh() {
    if (!await pathExists(path.join(this.cwd, '.git'))) return
    const status = await this.git(['status', '--short', '--branch']).catch(() => ({ stdout: '' }))
    const branchLine = status.stdout.split('\n')[0] || ''
    this.repository = {
      branch: await this.branch(),
      ahead: Number(branchLine.match(/ahead (\d+)/)?.[1] || 0),
      behind: Number(branchLine.match(/behind (\d+)/)?.[1] || 0),
      dirty: status.stdout.split('\n').slice(1).some(Boolean)
    }
  }

  async recordHistory(item) {
    this.history = [...this.history, createSyncHistoryRecord(item)].slice(-200)
    await outputJson(path.join(this.cwd, SYNC_METADATA_DIR, SYNC_HISTORY_FILE), {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: this.history
    }).catch(() => {})
  }
}

